import { useEffect, useState } from 'react';
import { api } from '../api/client';

const ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER', 'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'TRAINEE'];
const FLEET_ACCESS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'ALL'];

const emptyForm = () => ({ name: '', email: '', password: '', role: 'TRAINING_CAPTAIN', fleetAccess: 'ALL' });

export function Staff() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  function load() {
    api.get('/api/users').then(setUsers).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm((v) => !v);
  }

  function openEditForm(user) {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, password: '', role: user.role, fleetAccess: user.fleetAccess });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/api/users/${editingId}`, { name: form.name, role: form.role, fleetAccess: form.fleetAccess });
      } else {
        await api.post('/api/users', form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
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
        <button onClick={openCreateForm}>{showForm ? 'Cancel' : 'Add staff member'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div className="grid2">
            <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editingId} />
            </div>
          </div>
          <div className="grid2">
            {!editingId && (
              <div className="field"><label>Temporary password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></div>
            )}
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Fleet access</label>
            <select value={form.fleetAccess} onChange={(e) => setForm({ ...form, fleetAccess: e.target.value })}>
              {FLEET_ACCESS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Create'}</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {users.map((u) => (
        <div key={u.id} className="card row" style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{u.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email} · {u.role}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => openEditForm(u)}>Edit</button>
            <button className="danger" onClick={() => remove(u.id)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}
