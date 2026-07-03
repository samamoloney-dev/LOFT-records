import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatDate } from '../lib/format';

const STATUSES = [
  { value: 'SATISFACTORY', label: '✓' },
  { value: 'UNSATISFACTORY', label: '✗' },
  { value: 'NA', label: 'N/A' },
];

const CAN_EDIT_ROLES = [
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER', 'TRAINING_CAPTAIN',
];

function itemKey(item) {
  return `${item.category}||${item.description}`;
}

function SectorFields({ label, value, disabled, onChange }) {
  const v = value || {};
  const update = (field, fieldValue) => onChange({ ...v, [field]: fieldValue });

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div className="grid2">
        <div className="field">
          <label>Route</label>
          <input disabled={disabled} value={v.route || ''} onChange={(e) => update('route', e.target.value)} />
        </div>
        <div className="field">
          <label>Aircraft</label>
          <input disabled={disabled} value={v.aircraft || ''} onChange={(e) => update('aircraft', e.target.value)} />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Date</label>
          <input type="date" disabled={disabled} value={v.date || ''} onChange={(e) => update('date', e.target.value)} />
        </div>
        <div className="field">
          <label>Flight time (this flight)</label>
          <input type="number" step="0.1" disabled={disabled} value={v.thisFlight || ''} onChange={(e) => update('thisFlight', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Flight time (progressive total)</label>
        <input type="number" step="0.1" disabled={disabled} value={v.progressiveTotal || ''} onChange={(e) => update('progressiveTotal', e.target.value)} />
      </div>
    </div>
  );
}

export function Phase4Form({ traineeId }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/phase4/${traineeId}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [traineeId]);

  if (error) return <div className="error-text">{error}</div>;
  if (!data) return null;

  const assessment = data.assessment || { sectorDetails: {}, itemResults: {}, ntsScores: {}, comments: '' };
  const isTrainee = user.role === 'TRAINEE';
  const canEdit = CAN_EDIT_ROLES.includes(user.role) && !assessment.completedAt;
  const canSignApplicant = isTrainee ? user.traineeId === traineeId && !assessment.completedAt : !assessment.completedAt;
  const canComplete = canEdit && !!assessment.trainingCaptainSignature && !!assessment.applicantSignature && !assessment.completedAt;

  async function save(patch) {
    setError(null);
    try {
      const updated = await api.put(`/api/phase4/${traineeId}`, patch);
      setData((d) => ({ ...d, assessment: updated }));
    } catch (err) { setError(err.message); }
  }

  function updateSector(key, value) {
    save({ sectorDetails: { ...assessment.sectorDetails, [key]: value } });
  }

  function updateItemResult(item, field, value) {
    const key = itemKey(item);
    const next = { ...assessment.itemResults, [key]: { ...assessment.itemResults[key], [field]: value } };
    save({ itemResults: next });
  }

  function updateNts(marker, field, value) {
    const next = { ...assessment.ntsScores, [marker]: { ...assessment.ntsScores[marker], [field]: value } };
    save({ ntsScores: next });
  }

  async function complete() {
    setError(null);
    try {
      const updated = await api.post(`/api/phase4/${traineeId}/complete`);
      setData((d) => ({ ...d, assessment: updated }));
    } catch (err) { setError(err.message); }
  }

  const grouped = new Map();
  for (const item of data.items) {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item);
  }

  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Phase 4 — Check to Line Preparation</div>
        {assessment.completedAt ? (
          <div className="badge pass">Signed off {formatDate(assessment.completedAt)}</div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            A minimum of 4 sectors is dedicated to this phase, verifying all aspects of Phases 1–3 before the Applicant is recommended for a Check to Line.
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      <div className="grid2">
        <SectorFields label="Sectors 1 & 2" value={assessment.sectorDetails?.sectors12} disabled={!canEdit} onChange={(v) => updateSector('sectors12', v)} />
        <SectorFields label="Sectors 3 & 4" value={assessment.sectorDetails?.sectors34} disabled={!canEdit} onChange={(v) => updateSector('sectors34', v)} />
      </div>

      {[...grouped.entries()].map(([category, categoryItems]) => (
        <div key={category} className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
          {categoryItems.map((item) => {
            const key = itemKey(item);
            const result = assessment.itemResults?.[key] || {};
            return (
              <div key={key} className="row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{item.description}</div>
                    {item.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {STATUSES.map((s) => (
                      <button
                        key={s.value}
                        disabled={!canEdit}
                        className={`tick-btn ${result.status === s.value ? (s.value === 'UNSATISFACTORY' ? 'active-fail' : 'active-pass') : ''}`}
                        onClick={() => updateItemResult(item, 'status', s.value)}
                      >{s.label}</button>
                    ))}
                  </div>
                </div>
                <input
                  disabled={!canEdit}
                  placeholder="Remarks"
                  value={result.remarks || ''}
                  onChange={(e) => updateItemResult(item, 'remarks', e.target.value)}
                  style={{ marginTop: 4 }}
                />
              </div>
            );
          })}
        </div>
      ))}

      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Non Technical Skill Assessment</div>
        {data.ntsMarkers.map((marker) => {
          const score = assessment.ntsScores?.[marker] || {};
          return (
            <div key={marker} className="grid2" style={{ marginBottom: 8 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>{marker} — Score</label>
                <input disabled={!canEdit} value={score.score || ''} onChange={(e) => updateNts(marker, 'score', e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>{marker} — Code</label>
                <input disabled={!canEdit} value={score.code || ''} onChange={(e) => updateNts(marker, 'code', e.target.value)} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="field">
          <label>Comments</label>
          <textarea
            disabled={!canEdit}
            value={assessment.comments || ''}
            onChange={(e) => setData((d) => ({ ...d, assessment: { ...d.assessment, comments: e.target.value } }))}
            onBlur={() => save({ comments: assessment.comments })}
            style={{ minHeight: 80 }}
          />
        </div>

        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
          The Applicant has satisfactorily completed Training Phase 4. All paperwork and syllabus items have been
          checked for totality and accuracy and he/she is recommended for a Check to Line Flight Test.
        </div>
        <div className="grid2">
          <div className="field">
            <label>Training Captain signature</label>
            <input
              disabled={!canEdit}
              value={assessment.trainingCaptainSignature || ''}
              onChange={(e) => setData((d) => ({ ...d, assessment: { ...d.assessment, trainingCaptainSignature: e.target.value } }))}
              onBlur={() => save({ trainingCaptainSignature: assessment.trainingCaptainSignature })}
            />
          </div>
          <div className="field">
            <label>Applicant signature</label>
            <input
              disabled={!canSignApplicant}
              value={assessment.applicantSignature || ''}
              onChange={(e) => setData((d) => ({ ...d, assessment: { ...d.assessment, applicantSignature: e.target.value } }))}
              onBlur={() => save({ applicantSignature: assessment.applicantSignature })}
            />
          </div>
        </div>
        {canComplete && <button className="primary" onClick={complete}>Complete Phase 4</button>}
      </div>
    </div>
  );
}
