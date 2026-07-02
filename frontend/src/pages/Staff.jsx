import { useEffect, useState } from 'react';
import { api } from '../api/client';

const ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER', 'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'TRAINEE'];

export function Staff() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'TRAINING_CAPTAIN' });

  function load() {
    api.get('/api/users').then(setUsers).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/users', form);
      setShowForm(false);
      setForm({ name: '', email: '', password: '', role: 'TRAINING_CAPTAIN' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id) {
    setError(null);
    try { await api.delete(`/api/users/${id}`); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Staff accounts</div>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Add staff member'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="grid2">
            <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Temporary password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="primary">Create</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {users.map((u) => (
        <div key={u.id} className="card row" style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{u.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email} · {u.role}</div>
          </div>
          <button className="danger" onClick={() => remove(u.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}
