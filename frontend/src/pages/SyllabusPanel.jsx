import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return groups;
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
          <div style={{ fontSize: 13 }}>{item.description}</div>
          {(() => {
            const parts = [];
            if (showPhase) parts.push(`Phase ${item.phase}`);
            if (item.roleScope !== 'BOTH') parts.push(item.roleScope === 'CAPTAIN_ONLY' ? 'Captain' : 'FO');
            if (item.notes) parts.push(item.notes);
            return parts.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{parts.join(' · ')}</div>
            );
          })()}
          {item.completedAt && (
            <div style={{ fontSize: 11, color: 'var(--text-success)' }}>
              Signed off by {item.signedOffByName} on {new Date(item.completedAt).toLocaleDateString()}
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
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/syllabus/trainee/${trainee.id}`).then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, [trainee.id]);

  async function signOff(itemId, signedOffByName) {
    await api.post(`/api/syllabus/trainee/${trainee.id}/complete`, { syllabusItemId: itemId, signedOffByName });
    load();
  }

  const sectionItems = items.filter((i) => i.section === section);
  const grouped = groupByCategory(sectionItems);
  const outstanding = sectionItems.filter((i) => i.outstandingForPhase);
  const label = section === 'SYLLABUS' ? 'Syllabus' : 'Line Training Discussion';
  const isCabinAttendant = trainee.type === 'CABIN_ATTENDANT';

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

      {[...grouped.entries()].map(([category, categoryItems]) => (
        <div key={category} className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
          {categoryItems.map((item) => (
            <SyllabusItemRow key={item.id} item={item} onSignOff={signOff} showPhase={!isCabinAttendant} />
          ))}
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

function PhaseCompletionCard({ traineeId, phase, completion, onChange, onPhaseAdvance }) {
  const { user } = useAuth();
  const [tcSig, setTcSig] = useState(completion?.trainingCaptainSignature || '');
  const [applicantSig, setApplicantSig] = useState(completion?.applicantSignature || '');
  const [error, setError] = useState(null);

  const isTrainee = user.role === 'TRAINEE';
  const canSignTc = !isTrainee;
  const canSignApplicant = isTrainee ? user.traineeId === traineeId : true;
  const canComplete = !isTrainee && !!tcSig && !!applicantSig && !completion?.completedAt;

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
        <div className="badge pass">Signed off {new Date(completion.completedAt).toLocaleDateString()}</div>
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
          {canComplete && <button className="primary" onClick={complete}>Complete phase {phase}</button>}
          {error && <div className="error-text">{error}</div>}
        </>
      )}
    </div>
  );
}

export function PhaseCompletionPanel({ trainee, onTraineeChange }) {
  const [completions, setCompletions] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/syllabus/trainee/${trainee.id}/phase-completions`).then(setCompletions).catch((e) => setError(e.message));
  }
  useEffect(load, [trainee.id]);

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

  return (
    <div>
      {error && <div className="error-text">{error}</div>}
      {[1, 2, 3].map((phase) => (
        <PhaseCompletionCard
          key={phase}
          traineeId={trainee.id}
          phase={phase}
          completion={completionForPhase(phase)}
          onChange={updateCompletion}
          onPhaseAdvance={handlePhaseAdvance}
        />
      ))}
    </div>
  );
}
