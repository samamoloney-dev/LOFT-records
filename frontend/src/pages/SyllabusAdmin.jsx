import { useEffect, useState } from 'react';
import { api } from '../api/client';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const ROLE_SCOPES = ['BOTH', 'CAPTAIN_ONLY', 'FO_ONLY'];

export function SyllabusAdmin() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fleet: 'DASH_8', roleScope: 'BOTH', phase: 1, description: '', required: true });

  function load() {
    api.get('/api/syllabus/items').then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/syllabus/items', { ...form, phase: Number(form.phase) });
      setShowForm(false);
      setForm({ fleet: 'DASH_8', roleScope: 'BOTH', phase: 1, description: '', required: true });
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    setError(null);
    try { await api.delete(`/api/syllabus/items/${id}`); load(); }
    catch (err) { setError(err.message); }
  }

  const byFleet = items.reduce((acc, item) => {
    (acc[item.fleet] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Syllabus curriculum, by fleet and phase</div>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Add syllabus item'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="grid2">
            <div className="field">
              <label>Fleet</label>
              <select value={form.fleet} onChange={(e) => setForm({ ...form, fleet: e.target.value })}>
                {FLEETS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Role scope</label>
              <select value={form.roleScope} onChange={(e) => setForm({ ...form, roleScope: e.target.value })}>
                {ROLE_SCOPES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Phase</label>
              <input type="number" min="1" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} required />
            </div>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={(e) => setForm({ ...form, required: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                Required to complete phase
              </label>
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </div>
          <button type="submit" className="primary">Create</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {Object.keys(byFleet).length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No syllabus items yet.</div>
      )}
      {Object.entries(byFleet).map(([fleet, fleetItems]) => (
        <div key={fleet} className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{fleet}</div>
          {fleetItems.map((item) => (
            <div key={item.id} className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{item.description}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Phase {item.phase} · {item.roleScope}{item.required ? ' · required' : ''}
                </div>
              </div>
              <button className="danger" onClick={() => remove(item.id)}>Remove</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
