import { useEffect, useState } from 'react';
import { api } from '../api/client';

const EP_TYPES = ['Theory', 'Slide', 'Life Jacket', 'Conquest', 'Metro', 'Dash8', 'Fokker 100'];
const EP_ITEMS = [
  'Emergency Equipment Knowledge — location, duration, operation, precaution and post use',
  'Emergency Equipment Practical Demonstration',
  'Emergency Evacuation Procedures',
  'Emergency Evacuation Procedures Practical Demonstration',
  'Emergency Exit Operation',
  'Survival Knowledge',
  'Unlawful Interference',
  'Emergency Escape Slide',
];

const emptyDetails = () => ({ name: '', date: '', assessor: '', actype: '', types: [], items: {}, lifeJacketDate: '', scenarios: '', comments: '', assessorSig: '', candidateSig: '' });

export function EpChecks() {
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(emptyDetails());
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/checks?checkType=EMERGENCY_PROCEDURES').then(setChecks).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    if (!newForm.name.trim()) return;
    try {
      await api.post('/api/checks', { checkType: 'EMERGENCY_PROCEDURES', appliesTo: 'CABIN_ATTENDANT', details: newForm });
      setCreating(false);
      setNewForm(emptyDetails());
      load();
    } catch (err) { setError(err.message); }
  }

  async function patchDetails(check, patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { details: { ...check.details, ...patch } });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function setResult(check, result) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { result, completedAt: new Date().toISOString() });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  function toggleType(type) {
    setNewForm((f) => ({
      ...f,
      types: f.types.includes(type) ? f.types.filter((t) => t !== type) : [...f.types, type],
    }));
  }

  if (selected) {
    const d = selected.details || {};
    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 500 }}>{d.name} — Emergency Procedures Check</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(d.types || []).join(', ') || 'No type selected'}</div>
        </div>

        <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
          All items below are mandatory. Every line must contain an entry or be marked N (Not Tested).
        </div>

        <div className="card">
          {EP_ITEMS.map((item, i) => (
            <div key={i} className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1, fontSize: 13 }}>{item}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['S', 'X', 'N'].map((v) => (
                  <button
                    key={v}
                    className={`tick-btn ${d.items?.[i] === v ? (v === 'X' ? 'active-fail' : 'active-pass') : ''}`}
                    onClick={() => patchDetails(selected, { items: { ...d.items, [i]: d.items?.[i] === v ? undefined : v } })}
                  >{v === 'S' ? '✓' : v === 'X' ? '✗' : 'N'}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="field">
            <label>Life Jacket Training (Wet Drill) date — initial qualification only</label>
            <input type="date" defaultValue={d.lifeJacketDate} onBlur={(e) => patchDetails(selected, { lifeJacketDate: e.target.value })} />
          </div>
        </div>

        <div className="card">
          <div className="field">
            <label>Scenarios selected for the assessment</label>
            <textarea defaultValue={d.scenarios} onBlur={(e) => patchDetails(selected, { scenarios: e.target.value })} style={{ minHeight: 60 }} />
          </div>
          <div className="field">
            <label>Comments</label>
            <textarea defaultValue={d.comments} onBlur={(e) => patchDetails(selected, { comments: e.target.value })} style={{ minHeight: 60 }} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Overall assessment</label>
              <select value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
                <option value="">—</option>
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div className="field">
              <label>Overall score (1–5)</label>
              <input type="number" min="1" max="5" defaultValue={selected.score || ''} onBlur={(e) => api.patch(`/api/checks/${selected.id}`, { score: Number(e.target.value) || null }).then(load)} />
            </div>
          </div>
          <div className="grid2">
            <div className="field"><label>Assessor signature</label><input defaultValue={d.assessorSig} onBlur={(e) => patchDetails(selected, { assessorSig: e.target.value })} /></div>
            <div className="field"><label>Candidate signature</label><input defaultValue={d.candidateSig} onBlur={(e) => patchDetails(selected, { candidateSig: e.target.value })} /></div>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>12-month cycle, separate from IPC and Proficiency Check</div>
        <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Add emergency procedures check'}</button>
      </div>

      {creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="grid2">
            <div className="field"><label>Candidate name</label><input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} required /></div>
            <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Assessor</label><input value={newForm.assessor} onChange={(e) => setNewForm({ ...newForm, assessor: e.target.value })} /></div>
            <div className="field"><label>Aircraft type</label><input value={newForm.actype} onChange={(e) => setNewForm({ ...newForm, actype: e.target.value })} /></div>
          </div>
          <div className="field"><label>Check type (select all that apply)</label></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '0.875rem' }}>
            {EP_TYPES.map((t) => (
              <div
                key={t}
                onClick={() => toggleType(t)}
                style={{
                  padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  background: newForm.types.includes(t) ? 'var(--bg-accent)' : 'var(--surface-2)',
                  color: newForm.types.includes(t) ? 'var(--text-accent)' : 'inherit',
                }}
              >{t}</div>
            ))}
          </div>
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No emergency procedures checks yet.</div>}
      {checks.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.details?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(c.details?.types || []).join(', ') || 'No type selected'} · {c.details?.date || 'No date'}</div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
