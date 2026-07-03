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

export function SyllabusPanel({ trainee, onTraineeChange }) {
  const [items, setItems] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [tab, setTab] = useState('SYLLABUS');
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/syllabus/trainee/${trainee.id}`).then(setItems).catch((e) => setError(e.message));
    api.get(`/api/syllabus/trainee/${trainee.id}/phase-completions`).then(setCompletions).catch(() => {});
  }
  useEffect(load, [trainee.id]);

  async function completeItem(itemId) {
    await api.post(`/api/syllabus/trainee/${trainee.id}/complete`, { syllabusItemId: itemId });
    load();
  }

  // Advancing a phase changes trainee.phase (which drives outstandingForPhase
  // server-side) and the header shown above, so both need a refetch.
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

  const tabItems = items.filter((i) => i.section === tab);
  const grouped = groupByCategory(tabItems);
  const outstanding = items.filter((i) => i.outstandingForPhase);
  const completionForPhase = (phase) => completions.find((c) => c.phase === phase);

  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Syllabus — Phase {trainee.phase}</div>
        {outstanding.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No outstanding required items for this phase.</div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-warning)' }}>
            {outstanding.length} required item(s) outstanding to complete this phase.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: '1rem', borderBottom: '0.5px solid var(--border)' }}>
        <button
          onClick={() => setTab('SYLLABUS')}
          style={{ border: 'none', background: 'none', padding: '7px 14px', borderBottom: tab === 'SYLLABUS' ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: tab === 'SYLLABUS' ? 500 : 400 }}
        >Syllabus</button>
        <button
          onClick={() => setTab('DISCUSSION')}
          style={{ border: 'none', background: 'none', padding: '7px 14px', borderBottom: tab === 'DISCUSSION' ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: tab === 'DISCUSSION' ? 500 : 400 }}
        >Line Training Discussion</button>
      </div>

      {error && <div className="error-text">{error}</div>}

      {[...grouped.entries()].map(([category, categoryItems]) => (
        <div key={category} className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
          {categoryItems.map((item) => (
            <div key={item.id} className="row" style={{ cursor: 'default' }}>
              <button
                className={`tick-btn ${item.completedAt ? 'active-pass' : ''}`}
                onClick={() => completeItem(item.id)}
              >{item.completedAt ? '✓' : ''}</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{item.description}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Phase {item.phase}{item.roleScope !== 'BOTH' ? ` · ${item.roleScope === 'CAPTAIN_ONLY' ? 'Captain' : 'FO'}` : ''}
                  {item.notes ? ` · ${item.notes}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      {tabItems.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          No {tab === 'SYLLABUS' ? 'syllabus' : 'discussion'} items for this fleet yet.
        </div>
      )}

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
