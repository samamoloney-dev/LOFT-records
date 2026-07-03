import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';

// Check to Line Preparation Checklist, from SA_541 Cabin Crew Dash 8 Line
// Training Record.
const CA_ASSESSMENT_ITEMS = [
  'Competent on all duties and procedures from sign on to sign off without any assistance',
  'Knowledge on all Rules and Regulations is up to standard',
  'Knowledge on all Emergency Procedures is up to standard',
  'Knowledge on all Emergency and Survival Equipment is up to standard',
  'Knowledge on Aviation Medicine and First Aid is up to standard',
  'Satisfactorily completed all items of the training record and discussion list; recommended for a Check to Line',
];

const STATUSES = [
  { value: 'SATISFACTORY', label: '✓' },
  { value: 'UNSATISFACTORY', label: '✗' },
  { value: 'NA', label: 'N/A' },
];

function itemKey(item) {
  return `${item.category}||${item.description}`;
}

function SectorFields({ label, value, progressiveLabel, disabled, onChange }) {
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
          <label>Aircraft (type & rego)</label>
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
        <label>Flight time ({progressiveLabel})</label>
        <input type="number" step="0.1" disabled={disabled} value={v.progressiveTotal || ''} onChange={(e) => update('progressiveTotal', e.target.value)} />
      </div>
    </div>
  );
}

export function CtlForm({ traineeId, traineeType, onCompleted }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const isCabinAttendant = traineeType === 'CABIN_ATTENDANT';

  function load() {
    api.get(`/api/ctl/${traineeId}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [traineeId]);

  const canEdit = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER'].includes(user.role);
  const form = data?.form || { assessmentItems: {}, sectorDetails: {}, ntsScores: {}, comments: '', overallResult: null, overallScore: null };

  async function save(patch) {
    setError(null);
    try {
      const updated = await api.put(`/api/ctl/${traineeId}`, patch);
      setData((d) => ({ ...d, form: updated }));
    } catch (err) { setError(err.message); }
  }

  // Cabin attendant items stay a simple boolean pass/fail tick.
  async function setCaItem(item, value) {
    const next = { ...form.assessmentItems };
    next[item] = next[item] === value ? undefined : value;
    await save({ assessmentItems: next });
  }

  async function setItemStatus(item, status) {
    const key = itemKey(item);
    const next = { ...form.assessmentItems, [key]: status === form.assessmentItems[key] ? undefined : status };
    await save({ assessmentItems: next });
  }

  function updateSector(key, value) {
    save({ sectorDetails: { ...form.sectorDetails, [key]: value } });
  }

  function updateNts(marker, field, value) {
    const next = { ...form.ntsScores, [marker]: { ...form.ntsScores[marker], [field]: value } };
    save({ ntsScores: next });
  }

  async function setResult(overallResult) {
    await save({ overallResult });
  }

  async function complete() {
    setError(null);
    try {
      await api.post(`/api/ctl/${traineeId}/complete`);
      onCompleted();
    } catch (err) { setError(err.message); }
  }

  if (!data) return null;

  const grouped = new Map();
  if (!isCabinAttendant) {
    for (const item of data.items) {
      if (!grouped.has(item.category)) grouped.set(item.category, []);
      grouped.get(item.category).push(item);
    }
  }

  const locked = !canEdit || !!form.completedAt;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 500 }}>Check to Line Assessment</div>
        <button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Open'}</button>
      </div>
      {form.completedAt && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Completed {formatDate(form.completedAt)}</div>}

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          {isCabinAttendant ? (
            <>
              {CA_ASSESSMENT_ITEMS.map((item) => (
                <div key={item} className="row" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1, fontSize: 13 }}>{item}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className={`tick-btn ${form.assessmentItems[item] === true ? 'active-pass' : ''}`}
                      disabled={locked}
                      onClick={() => setCaItem(item, true)}
                    >✓</button>
                    <button
                      className={`tick-btn ${form.assessmentItems[item] === false ? 'active-fail' : ''}`}
                      disabled={locked}
                      onClick={() => setCaItem(item, false)}
                    >✗</button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="grid2">
                <SectorFields
                  label="Sectors 1 & 2"
                  progressiveLabel="progr. total"
                  value={form.sectorDetails?.sectors12}
                  disabled={locked}
                  onChange={(v) => updateSector('sectors12', v)}
                />
                <SectorFields
                  label="Sectors 3 & 4"
                  progressiveLabel="total LOFT"
                  value={form.sectorDetails?.sectors34}
                  disabled={locked}
                  onChange={(v) => updateSector('sectors34', v)}
                />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 0.875rem' }}>
                New to type: Min Total LOFT Captain 100 Hrs; FO 50 Hrs
              </div>

              {[...grouped.entries()].map(([category, categoryItems]) => (
                <div key={category} className="card">
                  <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
                  {categoryItems.map((item) => {
                    const key = itemKey(item);
                    const status = form.assessmentItems[key];
                    return (
                      <div key={key} className="row" style={{ cursor: 'default' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13 }}>{item.description}</div>
                          {item.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {STATUSES.map((s) => (
                            <button
                              key={s.value}
                              disabled={locked}
                              className={`tick-btn ${status === s.value ? (s.value === 'UNSATISFACTORY' ? 'active-fail' : 'active-pass') : ''}`}
                              onClick={() => setItemStatus(item, s.value)}
                            >{s.label}</button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              <div className="card">
                <div style={{ fontWeight: 500, marginBottom: 6 }}>Non Technical Skill Assessment</div>
                {data.ntsMarkers.map((marker) => {
                  const score = form.ntsScores?.[marker] || {};
                  return (
                    <div key={marker} className="grid2" style={{ marginBottom: 8 }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>{marker} — Score</label>
                        <input disabled={locked} value={score.score || ''} onChange={(e) => updateNts(marker, 'score', e.target.value)} />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label>{marker} — Code</label>
                        <input disabled={locked} value={score.code || ''} onChange={(e) => updateNts(marker, 'code', e.target.value)} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="field">
                <label>Comments</label>
                <textarea
                  disabled={locked}
                  value={form.comments || ''}
                  onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, comments: e.target.value } }))}
                  onBlur={() => save({ comments: form.comments })}
                  style={{ minHeight: 80 }}
                />
              </div>

              <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
                We the undersigned, do hereby mutually agree upon and accept the comments written in this document
                as being a correct and honest account of the performance of the trainee in each and every check
                procedure carried out.
              </div>
            </>
          )}

          <div className="field" style={{ marginTop: 12 }}>
            <label>Overall result</label>
            <select disabled={locked} value={form.overallResult || ''} onChange={(e) => setResult(e.target.value || null)}>
              <option value="">—</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>
          {!isCabinAttendant && (
            <div className="field">
              <label>Overall score (1-5)</label>
              <input
                type="number" min="1" max="5" disabled={locked}
                value={form.overallScore || ''}
                onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, overallScore: e.target.value } }))}
                onBlur={() => save({ overallScore: Number(form.overallScore) || null })}
              />
            </div>
          )}
          {!isCabinAttendant && (
            <div className="grid2">
              <div className="field">
                <label>Assessor's signature</label>
                <input
                  disabled={locked}
                  value={form.assessorSignature || ''}
                  onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, assessorSignature: e.target.value } }))}
                  onBlur={() => save({ assessorSignature: form.assessorSignature })}
                />
              </div>
              <div className="field">
                <label>Candidate signature</label>
                <input
                  disabled={locked}
                  value={form.candidateSignature || ''}
                  onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, candidateSignature: e.target.value } }))}
                  onBlur={() => save({ candidateSignature: form.candidateSignature })}
                />
              </div>
            </div>
          )}

          {canEdit && !form.completedAt && (
            <button className="primary" onClick={complete} disabled={!form.overallResult}>
              Complete and archive trainee
            </button>
          )}
          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </div>
  );
}
