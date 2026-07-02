import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const TYPES = ['PILOT', 'CABIN_ATTENDANT'];
const ROLES = ['CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT'];

export function Trainees() {
  const [trainees, setTrainees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', type: 'PILOT', role: 'FIRST_OFFICER', fleet: 'DASH_8' });
  const navigate = useNavigate();

  function load() {
    api.get('/api/trainees').then(setTrainees).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/trainees', form);
      setShowForm(false);
      setForm({ firstName: '', lastName: '', type: 'PILOT', role: 'FIRST_OFFICER', fleet: 'DASH_8' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Active trainees</div>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Add trainee'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="grid2">
            <div className="field"><label>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
            <div className="field"><label>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Fleet</label>
            <select value={form.fleet} onChange={(e) => setForm({ ...form, fleet: e.target.value })}>
              {FLEETS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button type="submit" className="primary">Create</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {trainees.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No trainees yet.</div>}
      {trainees.map((t) => (
        <div key={t.id} className="card row" onClick={() => navigate(`/trainees/${t.id}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{t.firstName} {t.lastName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.fleet} · {t.role} · Phase {t.phase} · {t.totalHours}h total</div>
          </div>
        </div>
      ))}
    </div>
  );
}
