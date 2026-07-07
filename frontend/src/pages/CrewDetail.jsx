import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { PilotLineCheck } from './PilotLineCheck';
import { DueBadge } from '../components/DueBadge';
import { ArchiveButton } from '../components/ArchiveButton';
import { TabBar } from '../components/TabBar';
import { formatFleet, formatTraineeRole } from '../lib/format';
import { competencyStatus } from '../lib/dueStatus';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

// Not every crew member is required to hold every competency - see
// CompetencyList's Not Applicable toggle below.
const NA_ELIGIBLE_COMPETENCIES = ['First Aid', 'CPR Training'];

// Cabin attendants start qualified on Dash 8 and can only add Fokker 100
// once they hold Dash 8 - mirrors Crew.jsx's FleetPicker (kept separate
// since that one isn't exported for reuse here).
function FleetPicker({ type, value, onChange }) {
  const fleets = FLEETS.filter((f) => (type === 'PILOT' ? !f.startsWith('CA_') : f.startsWith('CA_')));
  const isCabinAttendant = type === 'CABIN_ATTENDANT';

  function toggle(f) {
    if (!isCabinAttendant) {
      onChange(value.includes(f) ? [] : [f]);
      return;
    }
    if (f === 'CA_DASH_8' && value.includes('CA_FOKKER_100')) return;
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

// Edits the crew profile's own basic details - name/role/fleet are all
// disabled/hidden for name once linked to a staff account (read live from
// Staff instead - see the header display), but role and fleets always stay
// editable here since they're specific to this crew profile.
function CrewInfoEditor({ member, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: member.firstName, lastName: member.lastName, role: member.role, fleets: member.fleets });
  const [error, setError] = useState(null);

  const roles = member.type === 'PILOT' ? ['CAPTAIN', 'FIRST_OFFICER'] : ['CABIN_ATTENDANT'];

  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      const patch = member.isLinked ? { role: form.role, fleets: form.fleets } : form;
      onSaved(await api.patch(`/api/crew/${member.id}`, patch));
      setEditing(false);
    } catch (err) { setError(err.message); }
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setForm({ firstName: member.firstName, lastName: member.lastName, role: member.role, fleets: member.fleets });
          setEditing(true);
        }}
      >Edit crew information</button>
    );
  }

  return (
    <form onSubmit={save} className="card">
      {!member.isLinked && (
        <div className="grid2">
          <div className="field"><label>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
          <div className="field"><label>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
        </div>
      )}
      <div className="field">
        <label>Role</label>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {roles.map((r) => <option key={r} value={r}>{formatTraineeRole(r)}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Fleet{member.type === 'CABIN_ATTENDANT' ? 's' : ''}</label>
        <FleetPicker type={member.type} value={form.fleets} onChange={(fleets) => setForm({ ...form, fleets })} />
      </div>
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="primary">Save changes</button>
        <button type="button" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>
  );
}

// Once entered, an ARN doesn't need editing day to day - shown as plain
// text rather than a perpetually-editable field. Only a blank ARN (e.g. an
// older profile from before this was required) still shows the input.
function ArnDisplay({ member, onSaved }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  if (member.arn) {
    return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ARN {member.arn}</div>;
  }

  async function save() {
    if (!value.trim()) return;
    setError(null);
    try { onSaved(await api.patch(`/api/crew/${member.id}`, { arn: value.trim() })); }
    catch (err) { setError(err.message); }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ARN</label>
      <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={save} placeholder="Not yet entered" style={{ fontSize: 12, padding: '3px 6px', width: 120 }} />
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

// HOTC/HOFO/Flight Ops Admin only (this whole page is admin-gated already) -
// notes a planned date for an upcoming recurrent check, purely informational
// and distinct from the computed due date. Surfaced via DueBadge and
// Currency Overview as "Planned for X".
function PlannedDateEditor({ crewMemberId, checkKey, plannedDate, onSaved }) {
  const [value, setValue] = useState(plannedDate ? plannedDate.slice(0, 10) : '');

  async function save(next) {
    setValue(next);
    const updated = await api.put(`/api/crew/${crewMemberId}/planned-checks/${checkKey}`, { plannedDate: next || null });
    onSaved(updated);
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Plan a date</label>
      <input type="date" value={value} onChange={(e) => save(e.target.value)} style={{ fontSize: 11, padding: '4px 6px' }} />
    </div>
  );
}

// Recurrent checks archived from here (once redone/superseded) still need to
// be visible from this person's own profile, not just the general Archive
// tab - this toggle flips the archived prop the check list already supports.
function CurrencyFolder({ member }) {
  const isPilot = member.type === 'PILOT';
  const subTabs = isPilot
    ? [{ key: 'ep', label: 'Emergency Procedures' }, { key: 'ipc', label: 'IPC' }, { key: 'pc', label: 'Proficiency Check' }, { key: 'linecheck', label: 'Line Check' }]
    : [{ key: 'ep', label: 'Emergency Procedures' }, { key: 'linecheck', label: 'Line Check' }];
  const [subTab, setSubTab] = useState('ep');
  const [showArchived, setShowArchived] = useState(false);

  const name = member.name;
  // Only enforce fleet-matching in the assessor picker when it's
  // unambiguous - a crew member qualified on more than one fleet doesn't
  // have a single "the" fleet to filter by for a given check instance.
  const fleet = member.fleets.length === 1 ? member.fleets[0] : undefined;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <TabBar tabs={subTabs} active={subTab} onSelect={setSubTab} />
        <button onClick={() => setShowArchived((v) => !v)} style={{ marginBottom: '1.25rem' }}>
          {showArchived ? 'Show active' : 'Show archived'}
        </button>
      </div>

      {subTab === 'ep' && <EpChecks appliesTo={member.type} crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'ipc' && isPilot && <ProficiencyChecks variant="IPC_PC" label="IPC" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'pc' && isPilot && <ProficiencyChecks variant="PC" label="Proficiency Check" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'linecheck' && isPilot && <PilotLineCheck crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'linecheck' && !isPilot && <CaChecks crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
    </div>
  );
}

// Every active competency (managed on the Syllabus tab - see
// competency-types.js) is required for every crew member automatically -
// this always shows one row per active type, whether or not any dates
// have been entered yet, rather than needing them added one at a time
// from a dropdown. onChange fires after every load so the parent Expiry
// tab's due-soon/overdue highlight can stay in sync.
function CompetencyList({ crewMemberId, onChange }) {
  const [competencies, setCompetencies] = useState([]);
  const [error, setError] = useState(null);
  // Once completed + planned dates are both set, the dates are locked to
  // avoid accidental edits - this remembers which rows were explicitly
  // unlocked via the "Edit dates" checkbox, reset on every reload.
  const [unlocked, setUnlocked] = useState({});

  function load() {
    api.get(`/api/crew/${crewMemberId}/competencies`).then((data) => { setCompetencies(data); onChange?.(); }).catch((e) => setError(e.message));
  }
  useEffect(load, [crewMemberId]);

  async function updateCompetency(competencyTypeId, patch) {
    setError(null);
    try {
      const current = competencies.find((c) => c.competencyTypeId === competencyTypeId) || {};
      await api.put(`/api/crew/${crewMemberId}/competencies/${competencyTypeId}`, {
        completedDate: current.completedDate || null,
        dueDate: current.dueDate || null,
        plannedDate: current.plannedDate || null,
        na: current.na || false,
        courseSent: current.courseSent || false,
        ...patch,
      });
      load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Competencies</div>
      {error && <div className="error-text">{error}</div>}

      {competencies.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No competencies set up yet - add some on the Syllabus tab.</div>
      )}
      {competencies.map((c) => {
        const status = competencyStatus(c.dueDate);
        // Not every crew member is required to hold every competency - e.g.
        // First Aid is Metro/Conquest-only (mirrors the Ground School N/A
        // toggle for the same item), and some crew are exempt from CPR
        // Training. Scoped to exactly these two names rather than a
        // blanket feature.
        const canBeNa = NA_ELIGIBLE_COMPETENCIES.includes(c.name);
        const datesSet = !!(c.completedDate && c.plannedDate);
        const datesLocked = datesSet && !unlocked[c.competencyTypeId];
        return (
          <div key={c.competencyTypeId} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 500 }}>{c.name}</div>
              {!c.na && status && <DueBadge label="Status" info={{ dueDate: c.dueDate, status, plannedDate: c.plannedDate }} />}
            </div>
            {canBeNa && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!!c.na}
                  onChange={(e) => updateCompetency(c.competencyTypeId, { na: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                Not applicable to this crew member
              </label>
            )}
            {!c.na && (
              <>
                {datesSet && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={!!unlocked[c.competencyTypeId]}
                      onChange={(e) => setUnlocked((u) => ({ ...u, [c.competencyTypeId]: e.target.checked }))}
                      style={{ width: 'auto' }}
                    />
                    Edit dates
                  </label>
                )}
                <div className="grid2" style={{ marginTop: 8 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Completed date</label>
                    <input type="date" disabled={datesLocked} defaultValue={c.completedDate || ''} onBlur={(e) => updateCompetency(c.competencyTypeId, { completedDate: e.target.value || null })} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Due date</label>
                    <input type="date" disabled={datesLocked} defaultValue={c.dueDate || ''} onBlur={(e) => updateCompetency(c.competencyTypeId, { dueDate: e.target.value || null })} />
                  </div>
                </div>
                <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
                  <label>Planned date</label>
                  <input type="date" disabled={datesLocked} defaultValue={c.plannedDate || ''} onBlur={(e) => updateCompetency(c.competencyTypeId, { plannedDate: e.target.value || null })} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!c.courseSent}
                    onChange={(e) => updateCompetency(c.competencyTypeId, { courseSent: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  Course sent to candidate
                </label>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Everything with a due date lives here: recurrent check currency (EP/IPC/
// PC/Line Check) and ad-hoc competencies - kept out of the always-visible
// profile header (see the highlight badge there instead) so the page isn't
// cluttered with due-date cards nobody asked to see yet.
function ExpiryTab({ member, onSaved, onCompetenciesChanged }) {
  const isPilot = member.type === 'PILOT';
  return (
    <div>
      <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <DueBadge label="Emergency Procedures" info={member.currency.emergencyProcedures} />
          <PlannedDateEditor crewMemberId={member.id} checkKey="emergencyProcedures" plannedDate={member.currency.emergencyProcedures.plannedDate} onSaved={onSaved} />
        </div>
        {isPilot && (
          <div>
            <DueBadge label="IPC" info={member.currency.ipc} />
            <PlannedDateEditor crewMemberId={member.id} checkKey="ipc" plannedDate={member.currency.ipc.plannedDate} onSaved={onSaved} />
          </div>
        )}
        {isPilot && (
          <div>
            <DueBadge label="Proficiency Check" info={member.currency.proficiencyCheck} />
            <PlannedDateEditor crewMemberId={member.id} checkKey="proficiencyCheck" plannedDate={member.currency.proficiencyCheck.plannedDate} onSaved={onSaved} />
          </div>
        )}
        <div>
          <DueBadge label="Line Check" info={member.currency.lineCheck} />
          <PlannedDateEditor crewMemberId={member.id} checkKey="lineCheck" plannedDate={member.currency.lineCheck.plannedDate} onSaved={onSaved} />
        </div>
      </div>

      <CompetencyList crewMemberId={member.id} onChange={onCompetenciesChanged} />
    </div>
  );
}

export function CrewDetail() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [error, setError] = useState(null);
  const [topTab, setTopTab] = useState('currency');

  function load() {
    api.get(`/api/crew/${id}`).then(setMember).catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  const isPilot = member?.type === 'PILOT';

  async function archiveMember() {
    setError(null);
    try { setMember(await api.post(`/api/crew/${id}/archive`)); }
    catch (err) { setError(err.message); }
  }
  async function unarchiveMember() {
    setError(null);
    try { setMember(await api.post(`/api/crew/${id}/unarchive`)); }
    catch (err) { setError(err.message); }
  }

  if (error) return <div className="error-text">{error}</div>;
  if (!member) return null;

  const name = member.name;
  const needsAttention = member.urgentItems.length > 0;
  const topTabs = [{ key: 'currency', label: 'Dates' }, { key: 'expiry', label: needsAttention ? 'Expiration ⚠' : 'Expiration' }];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{member.fleets.map(formatFleet).join(', ')} · {formatTraineeRole(member.role)}</div>
          {member.type === 'PILOT' && <ArnDisplay member={member} onSaved={setMember} />}
        </div>
        <ArchiveButton archived={member.archived} canArchive onArchive={archiveMember} onUnarchive={unarchiveMember} />
      </div>

      <CrewInfoEditor member={member} onSaved={setMember} />

      <TabBar tabs={topTabs} active={topTab} onSelect={setTopTab} />

      {topTab === 'currency' && <CurrencyFolder member={member} />}
      {topTab === 'expiry' && <ExpiryTab member={member} onSaved={setMember} onCompetenciesChanged={load} />}
    </div>
  );
}
