import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatFleet, formatTraineeRole } from '../lib/format';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const TYPES = ['PILOT', 'CABIN_ATTENDANT'];
const ROLES = ['CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT'];
// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new trainee -
// no other staff role. Mirrors backend/src/routes/trainees.js POST /.
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

export function Trainees() {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [searchParams] = useSearchParams();
  const [trainees, setTrainees] = useState([]);
  // Lets the Home Dashboard's "Add Trainee" quick action (?new=1) land here
  // with the form already open, instead of requiring an extra click.
  const [showForm, setShowForm] = useState(isAdmin && searchParams.get('new') === '1');
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
        {isAdmin && <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Add trainee'}</button>}
      </div>

      {showForm && isAdmin && (
        <form className="card" onSubmit={handleCreate}>
          <div className="grid2">
            <div className="field"><label>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
            <div className="field"><label>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{formatTraineeRole(t)}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{formatTraineeRole(r)}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Fleet</label>
            <select value={form.fleet} onChange={(e) => setForm({ ...form, fleet: e.target.value })}>
              {FLEETS.map((f) => <option key={f} value={f}>{formatFleet(f)}</option>)}
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
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {formatFleet(t.fleet)} · {formatTraineeRole(t.role)}{t.type !== 'CABIN_ATTENDANT' && ` · Phase ${t.phase} · ${t.totalHours}h total`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
