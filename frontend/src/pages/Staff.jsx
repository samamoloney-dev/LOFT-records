import { useEffect, useState } from 'react';
import { api } from '../api/client';

const ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER', 'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'TRAINEE'];
const FLEET_ACCESS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'ALL'];
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];
const CHECK_ACCESS_OPTIONS = [
  { value: 'PC', label: 'PC' },
  { value: 'IPC', label: 'IPC' },
  { value: 'LINE_CHECK', label: 'Line Check' },
  { value: 'CHECK_TO_LINE', label: 'Check to line' },
  { value: 'EMERGENCY_PROCEDURES', label: 'Emergency procedures' },
];

const emptyForm = () => ({ name: '', email: '', password: '', role: 'TRAINING_CAPTAIN', fleetAccess: 'ALL', arn: '', checkAccess: [] });

function CheckAccessPicker({ value, onChange, disabled }) {
  function toggle(v) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {CHECK_ACCESS_OPTIONS.map((opt) => (
        <div
          key={opt.value}
          onClick={() => !disabled && toggle(opt.value)}
          style={{
            padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
            cursor: disabled ? 'default' : 'pointer', fontSize: 13, opacity: disabled ? 0.6 : 1,
            background: value.includes(opt.value) ? 'var(--bg-accent)' : 'var(--surface-2)',
            color: value.includes(opt.value) ? 'var(--text-accent)' : 'inherit',
          }}
        >{opt.label}</div>
      ))}
    </div>
  );
}

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
    setForm({ name: user.name, email: user.email, password: '', role: user.role, fleetAccess: user.fleetAccess, arn: user.arn || '', checkAccess: user.checkAccess || [] });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/api/users/${editingId}`, { name: form.name, role: form.role, fleetAccess: form.fleetAccess, arn: form.arn, checkAccess: form.checkAccess });
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

  const isAdminRole = ADMIN_ROLES.includes(form.role);

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
          <div className="grid2">
            <div className="field">
              <label>Fleet access</label>
              <select value={form.fleetAccess} onChange={(e) => setForm({ ...form, fleetAccess: e.target.value })}>
                {FLEET_ACCESS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="field"><label>ARN</label><input value={form.arn} onChange={(e) => setForm({ ...form, arn: e.target.value })} /></div>
          </div>
          <div className="field">
            <label>Check access{isAdminRole ? ' (this role already has access to everything)' : ' (which checks can this person be picked for)'}</label>
            <CheckAccessPicker
              value={form.checkAccess}
              onChange={(checkAccess) => setForm({ ...form, checkAccess })}
              disabled={isAdminRole}
            />
          </div>
          <button type="submit" className="primary">{editingId ? 'Save changes' : 'Create'}</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {users.map((u) => (
        <div key={u.id} className="card row" style={{ cursor: 'default' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{u.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email} · {u.role}{u.arn ? ` · ARN ${u.arn}` : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {ADMIN_ROLES.includes(u.role)
                ? 'Check access: all'
                : `Check access: ${(u.checkAccess || []).length ? u.checkAccess.map((v) => CHECK_ACCESS_OPTIONS.find((o) => o.value === v)?.label || v).join(', ') : 'none'}`}
            </div>
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
