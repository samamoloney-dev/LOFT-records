import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';

// Binary pass/fail only - no N/A / not-assessed option, and no non-technical
// skills scoring section, per docs/project-brief.md Section 5.
const PILOT_ASSESSMENT_ITEMS = [
  'Pre-flight preparation',
  'Normal procedures',
  'Abnormal / emergency procedures',
  'CRM and communication',
  'Approach and landing',
  'Overall handling',
];

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

export function CtlForm({ traineeId, traineeType, onCompleted }) {
  const { user } = useAuth();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const ASSESSMENT_ITEMS = traineeType === 'CABIN_ATTENDANT' ? CA_ASSESSMENT_ITEMS : PILOT_ASSESSMENT_ITEMS;

  function load() {
    api.get(`/api/ctl/${traineeId}`).then((data) => setForm(data || { assessmentItems: {}, overallResult: null, overallScore: null })).catch((e) => setError(e.message));
  }

  useEffect(load, [traineeId]);

  const canEdit = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER'].includes(user.role);

  async function setItem(item, value) {
    const next = { ...form.assessmentItems };
    next[item] = next[item] === value ? undefined : value;
    setError(null);
    try {
      const updated = await api.put(`/api/ctl/${traineeId}`, { assessmentItems: next });
      setForm(updated);
    } catch (err) { setError(err.message); }
  }

  async function setResult(overallResult) {
    setError(null);
    try { setForm(await api.put(`/api/ctl/${traineeId}`, { overallResult })); }
    catch (err) { setError(err.message); }
  }

  async function complete() {
    setError(null);
    try {
      await api.post(`/api/ctl/${traineeId}/complete`);
      onCompleted();
    } catch (err) { setError(err.message); }
  }

  if (!form) return null;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 500 }}>Check-to-Line Form</div>
        <button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Open'}</button>
      </div>
      {form.completedAt && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Completed {formatDate(form.completedAt)}</div>}

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          {ASSESSMENT_ITEMS.map((item) => (
            <div key={item} className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1, fontSize: 13 }}>{item}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className={`tick-btn ${form.assessmentItems[item] === true ? 'active-pass' : ''}`}
                  disabled={!canEdit || !!form.completedAt}
                  onClick={() => setItem(item, true)}
                >✓</button>
                <button
                  className={`tick-btn ${form.assessmentItems[item] === false ? 'active-fail' : ''}`}
                  disabled={!canEdit || !!form.completedAt}
                  onClick={() => setItem(item, false)}
                >✗</button>
              </div>
            </div>
          ))}

          <div className="field" style={{ marginTop: 12 }}>
            <label>Overall result</label>
            <select disabled={!canEdit || !!form.completedAt} value={form.overallResult || ''} onChange={(e) => setResult(e.target.value || null)}>
              <option value="">—</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>

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
