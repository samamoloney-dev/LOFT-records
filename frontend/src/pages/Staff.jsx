import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatUserRole, formatFleet } from '../lib/format';
import { TabBar } from '../components/TabBar';
import { DueBadge } from '../components/DueBadge';
import { GroundInstructorCheckForm } from './GroundInstructorCheckForm';
import { PersonnelCompetencyCheckForm } from './PersonnelCompetencyCheckForm';
import { GROUND_INSTRUCTOR_CHECK_ROLES, PERSONNEL_AIR_COMPETENCY_ROLES } from '../lib/roles';

// TRAINEE isn't offered here - trainee self-login accounts aren't created
// through this Staff form (see users.js, which still accepts the role for
// existing accounts).
const ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE', 'EXAMINER', 'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'SIMULATOR_ONLY'];
const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const CA_FLEET_VALUES = ['CA_DASH_8', 'CA_FOKKER_100'];
const PILOT_FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23'];
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
// ARN (Air Registration Number) is a pilot licence reference - not
// applicable to the two cabin-attendant-specific staff roles.
const CA_ONLY_ROLES = ['CA_TRAINER', 'CA_CHECKER'];
// Examiners, Check Captains, HOTC, HOFO, Alternate, CA Trainers and CA
// Checkers can cover more than one fleet - only Training Captain is
// qualified on a single fleet, same as real-world type ratings ("a Dash 8
// trainer cannot train Fokker 100 pilots").
const MULTI_FLEET_ROLES = ['EXAMINER', 'CC', 'HOTC', 'HOFO', 'ALTERNATE', 'CA_TRAINER', 'CA_CHECKER'];

const CHECK_ACCESS_OPTIONS = [
  { value: 'PC', label: 'PC' },
  { value: 'IPC', label: 'IPC' },
  { value: 'LINE_CHECK', label: 'Line Check' },
  { value: 'CHECK_TO_LINE', label: 'Check to line' },
  { value: 'EMERGENCY_PROCEDURES', label: 'Emergency procedures' },
];

const emptyForm = () => ({ name: '', email: '', password: '', role: 'TRAINING_CAPTAIN', fleets: [], arn: '', checkAccess: [] });

// Real per-aircraft FSTD facts (which simulator, its number/type) - set
// once here by an admin, reused by the "Autofill FSTD" button on the
// IPC/PC check form instead of being hardcoded or retyped every time.
const FSTD_AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];

function FstdPresetsPanel() {
  const [presets, setPresets] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/fstd-presets').then(setPresets).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  const presetFor = (aircraftType) => presets.find((p) => p.aircraftType === aircraftType) || {};

  async function save(aircraftType, patch) {
    setError(null);
    try {
      const current = presetFor(aircraftType);
      await api.put(`/api/fstd-presets/${encodeURIComponent(aircraftType)}`, {
        fstdNumber: current.fstdNumber || '',
        fstdType: current.fstdType || '',
        ...patch,
      });
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>FSTD presets</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        Used by the "Autofill FSTD" button on IPC/PC check forms.
      </div>
      {FSTD_AIRCRAFT_TYPES.map((aircraftType) => {
        const preset = presetFor(aircraftType);
        return (
          <div key={aircraftType} className="grid2" style={{ marginBottom: 8 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>{aircraftType} — FSTD number</label>
              <input defaultValue={preset.fstdNumber || ''} onBlur={(e) => save(aircraftType, { fstdNumber: e.target.value })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>{aircraftType} — FSTD type</label>
              <input defaultValue={preset.fstdType || ''} onBlur={(e) => save(aircraftType, { fstdType: e.target.value })} />
            </div>
          </div>
        );
      })}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

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
//
// options defaults to every fleet, but the caller scopes it to just the
// pilot or cabin-attendant fleets for a role restricted to one side - a
// CA Trainer/CA Checker must never be tickable for a pilot fleet (Dash 8/
// Fokker 100/Metro 23), since "Line Check" checkAccess is shared between
// the pilot and cabin-attendant Line Check forms (see PilotLineCheck.jsx/
// CaChecks.jsx's identical accessType="LINE_CHECK") - without this, a CA
// Checker ticked for a pilot fleet by mistake would show up as an eligible
// assessor on a Pilot Line Check, which they must never be able to conduct.
function FleetAccessPicker({ value, onChange, multi, disabled, options = FLEET_VALUES }) {
  function toggle(v) {
    if (multi) {
      onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    } else {
      onChange(value.includes(v) ? [] : [v]);
    }
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((f) => (
        <div
          key={f}
          onClick={() => !disabled && toggle(f)}
          style={{
            padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
            cursor: disabled ? 'default' : 'pointer', fontSize: 13, opacity: disabled ? 0.6 : 1,
            background: value.includes(f) ? 'var(--bg-accent)' : 'var(--surface-2)',
            color: value.includes(f) ? 'var(--text-accent)' : 'inherit',
          }}
        >{formatFleet(f)}</div>
      ))}
    </div>
  );
}

const STAFF_TABS = [
  { key: 'staff', label: 'Staff' },
  { key: 'fstd', label: 'FSTD' },
];

export function Staff() {
  const [tab, setTab] = useState('staff');
  return (
    <div>
      <TabBar tabs={STAFF_TABS} active={tab} onSelect={setTab} />
      {tab === 'staff' && <StaffAccountsPanel />}
      {tab === 'fstd' && <FstdPresetsPanel />}
    </div>
  );
}

function StaffAccountsPanel() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  // Not linking a crew member at creation means they're just line crew,
  // not training staff - this is the way to upgrade one later (e.g. to
  // Training Captain) without hand-typing a duplicate name.
  const [promoting, setPromoting] = useState(false);
  const [unlinkedCrew, setUnlinkedCrew] = useState([]);
  const [promoteCrewMemberId, setPromoteCrewMemberId] = useState('');
  const [expandedGicId, setExpandedGicId] = useState(null);
  const [expandedPacId, setExpandedPacId] = useState(null);

  function load() {
    api.get('/api/users').then(setUsers).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  useEffect(() => {
    if (!promoting) return;
    Promise.all([api.get('/api/crew?type=PILOT'), api.get('/api/crew?type=CABIN_ATTENDANT')])
      .then(([pilots, cabinAttendants]) => setUnlinkedCrew([...pilots, ...cabinAttendants].filter((m) => !m.isLinked)))
      .catch(() => {});
  }, [promoting]);

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm());
    setPromoting(false);
    setPromoteCrewMemberId('');
    setShowForm((v) => !v);
  }

  function openEditForm(user) {
    setEditingId(user.id);
    // Drops any fleet tick from the wrong side (e.g. a pilot fleet left on
    // a CA Trainer/CA Checker from before this restriction existed) rather
    // than carrying it through silently - see FleetAccessPicker.
    const validFleets = CA_ONLY_ROLES.includes(user.role) ? CA_FLEET_VALUES : PILOT_FLEET_VALUES;
    setForm({
      name: user.name, email: user.email, password: '', role: user.role,
      fleets: (user.fleets || []).filter((f) => validFleets.includes(f)),
      arn: user.arn || '', checkAccess: user.checkAccess || [],
    });
    setShowForm(true);
  }

  function selectCrewMemberToPromote(id) {
    setPromoteCrewMemberId(id);
    const member = unlinkedCrew.find((m) => m.id === id);
    if (member) setForm((f) => ({ ...f, name: member.name }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api.patch(`/api/users/${editingId}`, { name: form.name, role: form.role, fleets: form.fleets, arn: form.arn, checkAccess: form.checkAccess });
      } else {
        const created = await api.post('/api/users', form);
        if (promoteCrewMemberId) {
          await api.patch(`/api/crew/${promoteCrewMemberId}`, { userId: created.id });
        }
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      setPromoting(false);
      setPromoteCrewMemberId('');
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(id, name) {
    if (!window.confirm(`Permanently delete ${name}'s staff account? They will lose access immediately and this cannot be undone.`)) return;
    setError(null);
    try { await api.delete(`/api/users/${id}`); load(); }
    catch (err) { setError(err.message); }
  }

  const isAdminRole = ADMIN_ROLES.includes(form.role);
  const isMultiFleetRole = MULTI_FLEET_ROLES.includes(form.role);
  const isCaOnlyRole = CA_ONLY_ROLES.includes(form.role);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Staff accounts</div>
        <button onClick={openCreateForm}>{showForm ? 'Cancel' : 'Add staff member'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          {!editingId && (
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={promoting}
                  onChange={(e) => { setPromoting(e.target.checked); setPromoteCrewMemberId(''); }}
                  style={{ width: 'auto' }}
                />
                This is an existing crew member (upgrade them to staff, e.g. Training Captain)
              </label>
            </div>
          )}
          {promoting && (
            <div className="field">
              <label>Crew member</label>
              <select value={promoteCrewMemberId} onChange={(e) => selectCrewMemberToPromote(e.target.value)} required>
                <option value="">— Select —</option>
                {unlinkedCrew.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
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
              <select value={form.role} onChange={(e) => {
                const nextRole = e.target.value;
                const nextOptions = CA_ONLY_ROLES.includes(nextRole) ? CA_FLEET_VALUES : PILOT_FLEET_VALUES;
                const carriedFleets = form.fleets.filter((f) => nextOptions.includes(f));
                setForm({ ...form, role: nextRole, fleets: MULTI_FLEET_ROLES.includes(nextRole) ? carriedFleets : carriedFleets.slice(0, 1) });
              }}>
                {ROLES.map((r) => <option key={r} value={r}>{formatUserRole(r)}</option>)}
              </select>
            </div>
          </div>
          {!isCaOnlyRole && (
            <div className="field"><label>ARN</label><input value={form.arn} onChange={(e) => setForm({ ...form, arn: e.target.value })} /></div>
          )}
          <div className="field">
            <label>
              Fleet{isMultiFleetRole ? 's' : ''}
              {isMultiFleetRole ? ' (this role can be ticked for more than one fleet)' : ' (which fleet is this person qualified on)'}
            </label>
            <FleetAccessPicker
              value={form.fleets}
              onChange={(fleets) => setForm({ ...form, fleets })}
              multi={isMultiFleetRole}
              options={isCaOnlyRole ? CA_FLEET_VALUES : PILOT_FLEET_VALUES}
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
        <div key={u.id} className="card">
          <div className="row" style={{ cursor: 'default' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{u.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email} · {formatUserRole(u.role)}{u.arn ? ` · ARN ${u.arn}` : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {ADMIN_ROLES.includes(u.role) && !MULTI_FLEET_ROLES.includes(u.role)
                  ? 'Fleets: all'
                  : `Fleets: ${(u.fleets || []).length ? u.fleets.map(formatFleet).join(', ') : 'none'}`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {ADMIN_ROLES.includes(u.role)
                  ? 'Check access: all'
                  : `Check access: ${(u.checkAccess || []).length ? u.checkAccess.map((v) => CHECK_ACCESS_OPTIONS.find((o) => o.value === v)?.label || v).join(', ') : 'none'}`}
              </div>
              {u.groundInstructorCheck && (
                <div style={{ marginTop: 6 }}>
                  <DueBadge label="Ground Instructor Check" info={u.groundInstructorCheck} />
                </div>
              )}
              {u.personnelAirCompetency && (
                <div style={{ marginTop: 6 }}>
                  <DueBadge label="Personnel (Air) Competency Check" info={u.personnelAirCompetency} />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {GROUND_INSTRUCTOR_CHECK_ROLES.includes(u.role) && (
                <button onClick={() => setExpandedGicId((id) => (id === u.id ? null : u.id))}>
                  {expandedGicId === u.id ? 'Close' : 'Ground Instructor Check'}
                </button>
              )}
              {PERSONNEL_AIR_COMPETENCY_ROLES.includes(u.role) && (
                <button onClick={() => setExpandedPacId((id) => (id === u.id ? null : u.id))}>
                  {expandedPacId === u.id ? 'Close' : 'Personnel Competency Check'}
                </button>
              )}
              <button onClick={() => openEditForm(u)}>Edit</button>
              <button className="danger" onClick={() => remove(u.id, u.name)}>Remove</button>
            </div>
          </div>
          {expandedGicId === u.id && (
            <div style={{ marginTop: 10 }}>
              <GroundInstructorCheckForm userId={u.id} userName={u.name} />
            </div>
          )}
          {expandedPacId === u.id && (
            <div style={{ marginTop: 10 }}>
              <PersonnelCompetencyCheckForm userId={u.id} userName={u.name} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
