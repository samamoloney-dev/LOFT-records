import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatUserRole } from '../lib/format';

const ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER', 'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'TRAINEE'];
const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];
// Examiners, Check Captains, HOTC, HOFO, CA Trainers and CA Checkers can
// cover more than one fleet - only Training Captain is qualified on a single
// fleet, same as real-world type ratings ("a Dash 8 trainer cannot train
// Fokker 100 pilots").
const MULTI_FLEET_ROLES = ['EXAMINER', 'CC', 'HOTC', 'HOFO', 'CA_TRAINER', 'CA_CHECKER'];

// Pilot and cabin attendant fleets share the same city names (Dash 8, Fokker
// 100), so a single side-by-side picker needs distinct labels to avoid
// looking like the same option twice.
const FLEET_PICKER_LABELS = {
  DASH_8: 'Dash 8',
  FOKKER_100: 'Fokker 100',
  METRO_23: 'Metro 23',
  CA_DASH_8: 'Dash 8 (Cabin Crew)',
  CA_FOKKER_100: 'Fokker 100 (Cabin Crew)',
};
const CHECK_ACCESS_OPTIONS = [
  { value: 'PC', label: 'PC' },
  { value: 'IPC', label: 'IPC' },
  { value: 'LINE_CHECK', label: 'Line Check' },
  { value: 'CHECK_TO_LINE', label: 'Check to line' },
  { value: 'EMERGENCY_PROCEDURES', label: 'Emergency procedures' },
];

const emptyForm = () => ({ name: '', email: '', password: '', role: 'TRAINING_CAPTAIN', fleets: [], arn: '', checkAccess: [] });

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

// Mirrors CheckAccessPicker's pill-button pattern. In single mode (Training
// Captain only), picking a fleet replaces whatever was ticked - a Dash 8
// trainer can't also be a Fokker 100 trainer. In multi mode (everyone else
// except Training Captain), ticks toggle independently.
function FleetAccessPicker({ value, onChange, multi, disabled }) {
  function toggle(v) {
    if (multi) {
      onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    } else {
      onChange(value.includes(v) ? [] : [v]);
    }
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {FLEET_VALUES.map((f) => (
        <div
          key={f}
          onClick={() => !disabled && toggle(f)}
          style={{
            padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
            cursor: disabled ? 'default' : 'pointer', fontSize: 13, opacity: disabled ? 0.6 : 1,
            background: value.includes(f) ? 'var(--bg-accent)' : 'var(--surface-2)',
            color: value.includes(f) ? 'var(--text-accent)' : 'inherit',
          }}
        >{FLEET_PICKER_LABELS[f]}</div>
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
    setForm({ name: user.name, email: user.email, password: '', role: user.role, fleets: user.fleets || [], arn: user.arn || '', checkAccess: user.checkAccess || [] });
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/api/users/${editingId}`, { name: form.name, role: form.role, fleets: form.fleets, arn: form.arn, checkAccess: form.checkAccess });
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
  const isMultiFleetRole = MULTI_FLEET_ROLES.includes(form.role);

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
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, fleets: MULTI_FLEET_ROLES.includes(e.target.value) ? form.fleets : form.fleets.slice(0, 1) })}>
                {ROLES.map((r) => <option key={r} value={r}>{formatUserRole(r)}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>ARN</label><input value={form.arn} onChange={(e) => setForm({ ...form, arn: e.target.value })} /></div>
          <div className="field">
            <label>
              Fleet{isMultiFleetRole ? 's' : ''}
              {isMultiFleetRole ? ' (this role can be ticked for more than one fleet)' : ' (which fleet is this person qualified on)'}
            </label>
            <FleetAccessPicker
              value={form.fleets}
              onChange={(fleets) => setForm({ ...form, fleets })}
              multi={isMultiFleetRole}
            />
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
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email} · {formatUserRole(u.role)}{u.arn ? ` · ARN ${u.arn}` : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {ADMIN_ROLES.includes(u.role) && !MULTI_FLEET_ROLES.includes(u.role)
                ? 'Fleets: all'
                : `Fleets: ${(u.fleets || []).length ? u.fleets.map((f) => FLEET_PICKER_LABELS[f]).join(', ') : 'none'}`}
            </div>
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
