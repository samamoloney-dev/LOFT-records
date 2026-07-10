import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { DueBadge } from '../components/DueBadge';
import { TabBar } from '../components/TabBar';
import { formatFleet, formatTraineeRole } from '../lib/format';
import { compressImage } from '../lib/imageCompress';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

const emptyForm = (type) => ({
  firstName: '', lastName: '', type, role: type === 'PILOT' ? 'FIRST_OFFICER' : 'CABIN_ATTENDANT',
  fleets: [type === 'PILOT' ? 'DASH_8' : 'CA_DASH_8'],
  lastEpDate: '', lastIpcDate: '', lastPcDate: '', lineCheckAnchorDate: '', lastLineCheckDate: '',
  userId: '', arn: '', newHire: false, licencePhoto: null,
});

// Splits a staff account's full name into the first_name/last_name pair
// crew_members needs - best-effort (first word vs everything else), fine
// since a linked profile reads its display name live from Staff anyway
// (see serializeCrewMember) rather than these columns.
function splitName(fullName) {
  const [first, ...rest] = fullName.trim().split(/\s+/);
  return { firstName: first || '', lastName: rest.join(' ') || first || '' };
}

// So a Training Captain (etc.) in Staff never ends up hand-typed as a
// second, unlinked person here with the same name - link straight to the
// staff account instead, or get warned if a typed name collides with one.
function StaffLinkPicker({ staff, linkedUserIds, value, onLink }) {
  const eligible = staff.filter((s) => !linkedUserIds.has(s.id) || s.id === value);
  return (
    <div className="field">
      <label>Link to existing staff account (optional - keeps this the same profile as Staff)</label>
      <select value={value || ''} onChange={(e) => onLink(eligible.find((s) => s.id === e.target.value) || null)}>
        <option value="">— Not linked, new person —</option>
        {eligible.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}

// Cabin attendants start qualified on Dash 8 and can only add Fokker 100
// once they hold Dash 8 (real-world conversion-course requirement) - pilots
// stay single-fleet (radio-style picking).
function FleetPicker({ type, value, onChange }) {
  const fleets = FLEETS.filter((f) => (type === 'PILOT' ? !f.startsWith('CA_') : f.startsWith('CA_')));
  const isCabinAttendant = type === 'CABIN_ATTENDANT';

  function toggle(f) {
    if (!isCabinAttendant) {
      onChange(value.includes(f) ? [] : [f]);
      return;
    }
    if (f === 'CA_DASH_8' && value.includes('CA_FOKKER_100')) return; // can't drop Dash 8 while Fokker 100 is held
    onChange(value.includes(f) ? value.filter((x) => x !== f) : [...value, f]);
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {fleets.map((f) => {
        const disabled = isCabinAttendant && f === 'CA_FOKKER_100' && !value.includes('CA_DASH_8');
        return (
          <div
            key={f}
            onClick={() => !disabled && toggle(f)}
            title={disabled ? 'Dash 8 must be added first' : undefined}
            style={{
              padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
              cursor: disabled ? 'default' : 'pointer', fontSize: 13, opacity: disabled ? 0.4 : 1,
              background: value.includes(f) ? 'var(--bg-accent)' : 'var(--surface-2)',
              color: value.includes(f) ? 'var(--text-accent)' : 'inherit',
            }}
          >{formatFleet(f)}</div>
        );
      })}
    </div>
  );
}

function CrewRoster({ type }) {
  const [searchParams] = useSearchParams();
  const [members, setMembers] = useState([]);
  const [staff, setStaff] = useState([]);
  // Lets the Home Dashboard's "Quick Add Crew Member" quick action
  // (?quickAdd=1) land here with the form already open.
  const [showForm, setShowForm] = useState(searchParams.get('quickAdd') === '1');
  const [form, setForm] = useState(emptyForm(type));
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  function load() {
    api.get(`/api/crew?type=${type}`).then(setMembers).catch((e) => setError(e.message));
  }
  useEffect(load, [type]);
  useEffect(() => { api.get('/api/users').then(setStaff).catch(() => {}); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/crew', { ...form, userId: form.userId || undefined });
      setShowForm(false);
      setForm(emptyForm(type));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function pickLicencePhoto(file) {
    if (!file) return;
    setError(null);
    try {
      const photo = await compressImage(file);
      setForm((f) => ({ ...f, licencePhoto: photo }));
    } catch (err) { setError(err.message); }
  }

  function linkStaff(s) {
    if (!s) { setForm((f) => ({ ...f, userId: '' })); return; }
    setForm((f) => ({ ...f, userId: s.id, ...splitName(s.name), arn: s.arn || f.arn }));
  }

  const linkedUserIds = new Set(members.filter((m) => m.isLinked).map((m) => m.userId));
  // Warns if the typed name collides with an existing staff account or
  // another crew profile - the system's way of "knowing there aren't two
  // people with the same name" even when the admin didn't use the link
  // picker above.
  const typedName = `${form.firstName} ${form.lastName}`.trim().toLowerCase();
  const nameMatch = !form.userId && typedName && (
    staff.find((s) => s.name.trim().toLowerCase() === typedName)
    || members.find((m) => m.name.trim().toLowerCase() === typedName)
  );

  const roles = type === 'PILOT' ? ['CAPTAIN', 'FIRST_OFFICER'] : ['CABIN_ATTENDANT'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Active line crew</div>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'Quick add crew member'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <StaffLinkPicker staff={staff} linkedUserIds={linkedUserIds} value={form.userId} onLink={linkStaff} />
          <div className="grid2">
            <div className="field"><label>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} disabled={!!form.userId} required /></div>
            <div className="field"><label>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} disabled={!!form.userId} required /></div>
          </div>
          {type === 'PILOT' && (
            <div className="field"><label>ARN</label><input value={form.arn} onChange={(e) => setForm({ ...form, arn: e.target.value })} required /></div>
          )}
          {nameMatch && (
            <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
              "{nameMatch.name}" already exists{staff.includes(nameMatch) ? ' as a staff account' : ' as a crew member'} - this looks like a duplicate.
              {staff.includes(nameMatch) && !linkedUserIds.has(nameMatch.id) && (
                <> <button type="button" onClick={() => linkStaff(nameMatch)}>Link to it instead</button></>
              )}
            </div>
          )}
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roles.map((r) => <option key={r} value={r}>{formatTraineeRole(r)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fleet{type === 'CABIN_ATTENDANT' ? 's' : ''}</label>
            <FleetPicker type={type} value={form.fleets} onChange={(fleets) => setForm({ ...form, fleets })} />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              This is their own personal fleet (what they fly and get checked on) - set it here even for HOTC/HOFO, otherwise the system won't know which simulator form to assign them.
            </div>
          </div>

          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={form.newHire}
                onChange={(e) => setForm({ ...form, newHire: e.target.checked })}
                style={{ width: 'auto' }}
              />
              New hire - also create their Trainees LOFT record
            </label>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0.75rem 0 0.25rem' }}>
            Seed dates - leave blank if not yet current on an item. These start the anniversary clock.
          </div>
          <div className="field"><label>Last Emergency Procedures check date</label><input type="date" value={form.lastEpDate} onChange={(e) => setForm({ ...form, lastEpDate: e.target.value })} /></div>
          {type === 'PILOT' ? (
            <>
              <div className="grid2">
                <div className="field"><label>Last IPC date</label><input type="date" value={form.lastIpcDate} onChange={(e) => setForm({ ...form, lastIpcDate: e.target.value })} /></div>
                <div className="field"><label>Last Proficiency Check date</label><input type="date" value={form.lastPcDate} onChange={(e) => setForm({ ...form, lastPcDate: e.target.value })} /></div>
              </div>
              <div className="field">
                <label>Initial Check to Line date</label>
                <input type="date" value={form.lineCheckAnchorDate} onChange={(e) => setForm({ ...form, lineCheckAnchorDate: e.target.value })} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Their Line Check will always be due 365 days on from this date, then every 365 days after.</div>
              </div>
              <div className="field">
                <label>Licence photo (optional - if they're already qualified, add their most recent IPC licence entry photo)</label>
                {form.licencePhoto && (
                  <img src={form.licencePhoto} alt="Licence" style={{ maxWidth: 160, borderRadius: 6, marginBottom: 6, display: 'block' }} />
                )}
                <input type="file" accept="image/*" onChange={(e) => pickLicencePhoto(e.target.files[0])} />
              </div>
            </>
          ) : (
            <div className="field"><label>Last Line Check date</label><input type="date" value={form.lastLineCheckDate} onChange={(e) => setForm({ ...form, lastLineCheckDate: e.target.value })} /></div>
          )}
          <button type="submit" className="primary">Add to Crew roster</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {members.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No crew members yet.</div>}
      {members.map((m) => (
        <div key={m.id} className="card row" onClick={() => navigate(`/crew/${m.id}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.fleets.map(formatFleet).join(', ')} · {formatTraineeRole(m.role)}</div>
          </div>
          {m.urgentItems.length > 0 && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {m.urgentItems.map((item, i) => <DueBadge key={i} label={item.label} info={item} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Archiving a crew member previously made their profile invisible
// everywhere (they simply dropped out of the Pilots/Cabin Attendants
// rosters) - this tab is the way back to them, for both re-checking their
// history and unarchiving via the ArchiveButton on their own profile page.
function ArchivedCrew() {
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  function load() {
    Promise.all([
      api.get('/api/crew?type=PILOT&archived=true'),
      api.get('/api/crew?type=CABIN_ATTENDANT&archived=true'),
    ]).then(([pilots, cabinAttendants]) => setMembers([...pilots, ...cabinAttendants])).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Archived crew - open a profile to unarchive it.</div>
      {error && <div className="error-text">{error}</div>}
      {members.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No archived crew members.</div>}
      {members.map((m) => (
        <div key={m.id} className="card row" onClick={() => navigate(`/crew/${m.id}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.fleets.map(formatFleet).join(', ')} · {formatTraineeRole(m.role)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Crew() {
  const tabs = [{ key: 'pilots', label: 'Pilots' }, { key: 'cabin-attendants', label: 'Cabin Attendants' }, { key: 'archived', label: 'Archived' }];
  const [tab, setTab] = useState('pilots');

  return (
    <div>
      <TabBar tabs={tabs} active={tab} onSelect={setTab} />
      {tab === 'pilots' && <CrewRoster type="PILOT" />}
      {tab === 'cabin-attendants' && <CrewRoster type="CABIN_ATTENDANT" />}
      {tab === 'archived' && <ArchivedCrew />}
    </div>
  );
}
