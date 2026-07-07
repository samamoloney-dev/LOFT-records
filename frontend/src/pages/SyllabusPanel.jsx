import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';
import { TRAINER_ROLES } from '../lib/roles';
import { NoteInfoIcon } from '../components/NoteInfoIcon';

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return groups;
}

// Phase 1/2/3, each containing its own category (subject) groups - a
// category that has items in more than one phase (role-split items) simply
// appears again under the other phase, keeping its subject name each time.
function groupByPhaseThenCategory(items) {
  const phases = new Map();
  for (const item of items) {
    if (!phases.has(item.phase)) phases.set(item.phase, new Map());
    const categories = phases.get(item.phase);
    if (!categories.has(item.category)) categories.set(item.category, []);
    categories.get(item.category).push(item);
  }
  return new Map([...phases.entries()].sort((a, b) => a[0] - b[0]));
}

// Trainer comments at the subject (category) level, not per individual
// topic - one box per category card, shared by pilots and cabin crew.
function CategoryNoteField({ traineeId, category, section, initialNotes }) {
  const [value, setValue] = useState(initialNotes || '');
  const [error, setError] = useState(null);

  async function save() {
    setError(null);
    try {
      await api.put(`/api/syllabus/trainee/${traineeId}/category-notes`, { category, section, notes: value });
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="field" style={{ marginTop: 10 }}>
      <label>Comments — {category}</label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        style={{ minHeight: 50 }}
        placeholder="Notes on this subject"
      />
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

function SyllabusItemRow({ item, onSignOff, showPhase }) {
  const { user } = useAuth();
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState(item.signedOffByName || user.name);
  const [error, setError] = useState(null);

  async function confirm() {
    if (!name.trim()) return;
    setError(null);
    try {
      await onSignOff(item.id, name.trim());
      setSigning(false);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          className={`tick-btn ${item.completedAt ? 'active-pass' : ''}`}
          onClick={() => setSigning((v) => !v)}
        >{item.completedAt ? '✓' : ''}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13 }}>
            {item.description}
            {TRAINER_ROLES.includes(user.role) && <NoteInfoIcon note={item.notes} />}
          </div>
          {(() => {
            const parts = [];
            if (showPhase) parts.push(`Phase ${item.phase}`);
            if (item.roleScope !== 'BOTH') parts.push(item.roleScope === 'CAPTAIN_ONLY' ? 'Captain' : 'FO');
            return parts.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{parts.join(' · ')}</div>
            );
          })()}
          {item.completedAt && (
            <div style={{ fontSize: 11, color: 'var(--text-success)' }}>
              Signed off by {item.signedOffByName} on {formatDate(item.completedAt)}
            </div>
          )}
        </div>
      </div>
      {signing && (
        <div style={{ display: 'flex', gap: 8, marginTop: 6, marginLeft: 32, alignItems: 'center' }}>
          <input
            style={{ maxWidth: 220 }}
            placeholder="Signed off by (name)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="primary" onClick={confirm}>Sign off</button>
          <button onClick={() => setSigning(false)}>Cancel</button>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

export function SyllabusItemsList({ trainee, section }) {
  const [items, setItems] = useState([]);
  const [categoryNotes, setCategoryNotes] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/syllabus/trainee/${trainee.id}`).then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, [trainee.id]);
  useEffect(() => {
    api.get(`/api/syllabus/trainee/${trainee.id}/category-notes`).then(setCategoryNotes).catch(() => {});
  }, [trainee.id]);

  async function signOff(itemId, signedOffByName) {
    await api.post(`/api/syllabus/trainee/${trainee.id}/complete`, { syllabusItemId: itemId, signedOffByName });
    load();
  }

  const sectionItems = items.filter((i) => i.section === section);
  const outstanding = sectionItems.filter((i) => i.outstandingForPhase);
  const label = section === 'SYLLABUS' ? 'Syllabus' : 'Line Training Discussion';
  const isCabinAttendant = trainee.type === 'CABIN_ATTENDANT';
  const noteFor = (category) => categoryNotes.find((n) => n.category === category && n.section === section)?.notes || '';

  // Cabin crew have no phases, so their items stay a flat list of category
  // cards; pilots see each phase as its own section, categories repeated
  // wherever they have items for that phase.
  const byPhase = isCabinAttendant ? null : groupByPhaseThenCategory(sectionItems);
  const flatGrouped = isCabinAttendant ? groupByCategory(sectionItems) : null;

  function renderCategoryCard(category, categoryItems, keyPrefix) {
    return (
      <div key={keyPrefix} className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
        {categoryItems.map((item) => (
          <SyllabusItemRow key={item.id} item={item} onSignOff={signOff} showPhase={false} />
        ))}
        <CategoryNoteField traineeId={trainee.id} category={category} section={section} initialNotes={noteFor(category)} />
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>{label}{!isCabinAttendant && ` — Phase ${trainee.phase}`}</div>
        {outstanding.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {isCabinAttendant ? 'No outstanding required items.' : 'No outstanding required items for this phase.'}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-warning)' }}>
            {isCabinAttendant
              ? `${outstanding.length} required item(s) outstanding.`
              : `${outstanding.length} required item(s) outstanding to complete this phase.`}
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {isCabinAttendant
        ? [...flatGrouped.entries()].map(([category, categoryItems]) => renderCategoryCard(category, categoryItems, category))
        : [...byPhase.entries()].map(([phase, categories]) => (
          <div key={phase} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>Phase {phase}</div>
            {[...categories.entries()].map(([category, categoryItems]) => renderCategoryCard(category, categoryItems, `${phase}-${category}`))}
          </div>
        ))}
      {sectionItems.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          No {label.toLowerCase()} items for this fleet yet.
        </div>
      )}
    </div>
  );
}

// Cabin crew "Required Tasks" syllabus, embedded within a specific flight -
// re-signed on every flight rather than carried over, per the paper record
// where each flight has its own copy of the required-tasks table.
export function FlightSyllabusList({ flightId, trainee, onChange }) {
  const [items, setItems] = useState([]);
  const [categoryNotes, setCategoryNotes] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/syllabus/flight/${flightId}`).then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, [flightId]);
  useEffect(() => {
    api.get(`/api/syllabus/trainee/${trainee.id}/category-notes`).then(setCategoryNotes).catch(() => {});
  }, [trainee.id]);

  async function signOff(itemId, signedOffByName) {
    await api.post(`/api/syllabus/flight/${flightId}/complete`, { syllabusItemId: itemId, signedOffByName });
    load();
    onChange?.();
  }

  const grouped = groupByCategory(items);
  const outstanding = items.filter((i) => !i.completedAt);
  const noteFor = (category) => categoryNotes.find((n) => n.category === category && n.section === 'SYLLABUS')?.notes || '';

  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Syllabus for this flight</div>
        {outstanding.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All required tasks signed off for this flight.</div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-warning)' }}>
            {outstanding.length} required task(s) not yet signed off for this flight.
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {[...grouped.entries()].map(([category, categoryItems]) => (
        <div key={category} className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
          {categoryItems.map((item) => (
            <SyllabusItemRow key={item.id} item={item} onSignOff={signOff} showPhase={false} />
          ))}
          <CategoryNoteField traineeId={trainee.id} category={category} section="SYLLABUS" initialNotes={noteFor(category)} />
        </div>
      ))}
      {items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          No syllabus items for this fleet yet.
        </div>
      )}
    </div>
  );
}

function PhaseCompletionCard({ traineeId, phase, completion, outstandingCount, onChange, onPhaseAdvance }) {
  const { user } = useAuth();
  const [tcSig, setTcSig] = useState(completion?.trainingCaptainSignature || '');
  const [applicantSig, setApplicantSig] = useState(completion?.applicantSignature || '');
  const [error, setError] = useState(null);

  const isTrainee = user.role === 'TRAINEE';
  const canSignTc = !isTrainee;
  const canSignApplicant = isTrainee ? user.traineeId === traineeId : true;
  const canComplete = !isTrainee && !!tcSig && !!applicantSig && !completion?.completedAt && outstandingCount === 0;

  async function saveSignature(field, value) {
    setError(null);
    try {
      const updated = await api.put(`/api/syllabus/trainee/${traineeId}/phase-completions/${phase}`, { [field]: value });
      onChange(updated);
    } catch (err) { setError(err.message); }
  }

  async function complete() {
    setError(null);
    try {
      const updated = await api.post(`/api/syllabus/trainee/${traineeId}/phase-completions/${phase}/complete`);
      onChange(updated);
      onPhaseAdvance();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Phase {phase} completion</div>
      {completion?.completedAt ? (
        <div className="badge pass">Signed off {formatDate(completion.completedAt)}</div>
      ) : (
        <>
          <div className="grid2">
            <div className="field">
              <label>Training Captain signature</label>
              <input
                disabled={!canSignTc}
                value={tcSig}
                onChange={(e) => setTcSig(e.target.value)}
                onBlur={() => canSignTc && saveSignature('trainingCaptainSignature', tcSig)}
              />
            </div>
            <div className="field">
              <label>Applicant signature</label>
              <input
                disabled={!canSignApplicant}
                value={applicantSig}
                onChange={(e) => setApplicantSig(e.target.value)}
                onBlur={() => canSignApplicant && saveSignature('applicantSignature', applicantSig)}
              />
            </div>
          </div>
          {!completion?.completedAt && outstandingCount > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-warning)', marginBottom: 8 }}>
              {outstandingCount} required item(s) for Phase {phase} still need to be signed off before this phase can be completed.
            </div>
          )}
          {canComplete && <button className="primary" onClick={complete}>Complete phase {phase}</button>}
          {error && <div className="error-text">{error}</div>}
        </>
      )}
    </div>
  );
}

export function PhaseCompletionPanel({ trainee, onTraineeChange }) {
  const [completions, setCompletions] = useState([]);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/syllabus/trainee/${trainee.id}/phase-completions`).then(setCompletions).catch((e) => setError(e.message));
  }
  useEffect(load, [trainee.id]);
  useEffect(() => {
    api.get(`/api/syllabus/trainee/${trainee.id}`).then(setItems).catch(() => {});
  }, [trainee.id]);

  function handlePhaseAdvance() {
    load();
    onTraineeChange();
  }

  function updateCompletion(updated) {
    setCompletions((cs) => {
      const exists = cs.some((c) => c.phase === updated.phase);
      return exists ? cs.map((c) => (c.phase === updated.phase ? updated : c)) : [...cs, updated];
    });
  }

  const completionForPhase = (phase) => completions.find((c) => c.phase === phase);
  // Only phases 1-3 are gated on required items - Phase 4 is a distinct
  // Check-to-Line preparation assessment, not a syllabus/discussion phase.
  const outstandingForPhase = (phase) => (phase > 3 ? 0 : items.filter((i) => i.phase === phase && i.required && !i.completedAt).length);

  return (
    <div>
      {error && <div className="error-text">{error}</div>}
      {[1, 2, 3, 4].map((phase) => (
        <PhaseCompletionCard
          key={phase}
          traineeId={trainee.id}
          phase={phase}
          completion={completionForPhase(phase)}
          outstandingCount={outstandingForPhase(phase)}
          onChange={updateCompletion}
          onPhaseAdvance={handlePhaseAdvance}
        />
      ))}
    </div>
  );
}
