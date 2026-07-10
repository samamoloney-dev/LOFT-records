import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLES } from '../lib/checkAccess';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { PilotLineCheck } from './PilotLineCheck';
import { ClearanceTab } from './ClearanceTab';
import { CaptainInTrainingForm } from './CaptainInTrainingForm';
import { DueBadge } from '../components/DueBadge';
import { ArchiveButton } from '../components/ArchiveButton';
import { TabBar } from '../components/TabBar';
import { formatFleet, formatTraineeRole } from '../lib/format';
import { competencyStatus } from '../lib/dueStatus';
import { compressImage } from '../lib/imageCompress';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

// Mirrors CurrencyOverview.jsx's STATUS_ORDER - overdue/not-yet-completed
// first, then due soon, then current, with Not Applicable always last
// since it isn't limiting anything.
const COMPETENCY_STATUS_ORDER = { overdue: 0, not_completed: 1, due_soon: 2, ok: 3 };
function competencySortRank(c) {
  if (c.na) return 4;
  return COMPETENCY_STATUS_ORDER[competencyStatus(c.dueDate)] ?? 4;
}

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
function initCrewInfoForm(member) {
  return {
    firstName: member.firstName, lastName: member.lastName, role: member.role, fleets: member.fleets,
    lineCheckAnchorDate: member.lineCheckAnchorDate ? member.lineCheckAnchorDate.slice(0, 10) : '',
    captainInTraining: !!member.captainInTraining,
  };
}

function CrewInfoEditor({ member, onSaved }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => initCrewInfoForm(member));
  const [error, setError] = useState(null);

  const roles = member.type === 'PILOT' ? ['CAPTAIN', 'FIRST_OFFICER'] : ['CABIN_ATTENDANT'];
  const isPilot = member.type === 'PILOT';
  const isAdmin = ADMIN_ROLES.includes(user.role);

  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      const base = member.isLinked ? { role: form.role, fleets: form.fleets } : form;
      const patch = isPilot ? { ...base, lineCheckAnchorDate: form.lineCheckAnchorDate || null, captainInTraining: form.captainInTraining } : base;
      onSaved(await api.patch(`/api/crew/${member.id}`, patch));
      setEditing(false);
    } catch (err) { setError(err.message); }
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setForm(initCrewInfoForm(member));
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
      {isPilot && (
        <div className="field">
          <label>Initial Check to Line date</label>
          <input type="date" value={form.lineCheckAnchorDate} onChange={(e) => setForm({ ...form, lineCheckAnchorDate: e.target.value })} />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Their Line Check will always be due 365 days on from this date, then every 365 days after.</div>
        </div>
      )}
      {isPilot && isAdmin && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.captainInTraining}
            onChange={(e) => setForm({ ...form, captainInTraining: e.target.checked })}
            style={{ width: 'auto' }}
          />
          Allocated to Captain in Training (unlocks the CIT Preliminary/Final assessments below)
        </label>
      )}
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

// Medical, styled to match the other boxes in this row (DueBadge + a
// compact "Plan a date" input) rather than the fuller Competencies-list
// card - actually editing Completed/Due dates now happens on the dedicated
// Medical tab (see MedicalTab below); this stays a read-only-plus-planning
// summary, same as EP/IPC/PC/Line Check's boxes work (their due/completed
// dates aren't editable here either - only planning an upcoming date is).
function MedicalBox({ medical, onUpdate }) {
  const status = competencyStatus(medical.dueDate);
  const [value, setValue] = useState(medical.plannedDate ? medical.plannedDate.slice(0, 10) : '');

  async function savePlanned(next) {
    setValue(next);
    await onUpdate(medical.competencyTypeId, { plannedDate: next || null });
  }

  return (
    <div>
      <DueBadge label="Medical" info={{ dueDate: medical.dueDate, status, completedDate: medical.completedDate, plannedDate: medical.plannedDate }} />
      <div style={{ marginTop: 4 }}>
        <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Plan a date</label>
        <input type="date" value={value} onChange={(e) => savePlanned(e.target.value)} style={{ fontSize: 11, padding: '4px 6px' }} />
      </div>
    </div>
  );
}

// Full Completed/Due/Planned date editing for Medical, on its own tab
// rather than mixed into the general Competencies list (see CrewDetail) -
// reuses the same CompetencyRow the Competencies list uses for everything
// else, just scoped to the one Medical entry.
function MedicalTab({ medical, onUpdate, unlocked, setUnlocked, error }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Medical</div>
      {error && <div className="error-text">{error}</div>}
      <CompetencyRow c={medical} onUpdate={onUpdate} unlocked={unlocked} setUnlocked={setUnlocked} />
    </div>
  );
}

// The photo of the IPC entry on the candidate's physical licence (see
// ProficiencyChecks.jsx's Hard-copy licence IPC entry field) - viewed here
// rather than cluttering the Expiration tab, and replaced automatically
// each time a new IPC is completed for this pilot.
// The "Add photo" button here is a one-off manual backfill for staff who
// were already employed when licence photo capture shipped - going
// forward, ordinary updates come from the IPC form's own capture flow
// (see ProficiencyChecks.jsx PATCH /api/checks/:id/licence-photo), which
// overwrites this same field.
function LicencePhotoTab({ member, onSaved }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function pickPhoto(file) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const photo = await compressImage(file);
      const updated = await api.patch(`/api/crew/${member.id}`, { licencePhoto: photo });
      onSaved(updated);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Photo of the IPC entry on this pilot's physical licence - taken from their most recently completed IPC.
      </div>
      <div className="card">
        {member.licencePhoto ? (
          <img src={member.licencePhoto} alt="Licence IPC entry" style={{ maxWidth: 320, borderRadius: 6, display: 'block', marginBottom: 10 }} />
        ) : (
          <div style={{ color: 'var(--text-secondary)', marginBottom: 10 }}>No licence photo on file yet - add one from an IPC form.</div>
        )}
        <div style={{ fontSize: 12, marginBottom: 4 }}>{busy ? 'Uploading…' : member.licencePhoto ? 'Replace photo' : 'Add photo'}</div>
        <input type="file" accept="image/*" disabled={busy} onChange={(e) => pickPhoto(e.target.files[0])} />
        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}

// Recurrent checks archived from here (once redone/superseded) still need to
// be visible from this person's own profile, not just the general Archive
// tab - this toggle flips the archived prop the check list already supports.
function CurrencyFolder({ member }) {
  const isPilot = member.type === 'PILOT';
  const subTabs = isPilot
    ? [
      { key: 'ep', label: 'Emergency Procedures' }, { key: 'ipc', label: 'IPC' }, { key: 'pc', label: 'Proficiency Check' }, { key: 'linecheck', label: 'Line Check' },
      // Only shown once an admin has allocated this pilot to a Captain
      // upgrade (see CrewInfoEditor) - not offered to every pilot.
      ...(member.captainInTraining ? [{ key: 'citPrelim', label: 'CIT Preliminary' }, { key: 'citFinal', label: 'CIT Final' }] : []),
    ]
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
      {subTab === 'citPrelim' && isPilot && <CaptainInTrainingForm variant="PRELIMINARY" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
      {subTab === 'citFinal' && isPilot && <CaptainInTrainingForm variant="FINAL" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} />}
    </div>
  );
}

// One competency's status badge + editable dates - used by the general
// Competencies list below the top block (Medical is special-cased into its
// own compact MedicalBox above instead - see ExpiryTab).
function CompetencyRow({ c, onUpdate, unlocked, setUnlocked }) {
  const { user } = useAuth();
  // Refresher Training is the one exception - Flight Ops Admin administers
  // that course's completions too (see PilotLineCheck.jsx's Refresher
  // Training row), so they also get the unlock for this competency only.
  // Mirrors the same exception enforced server-side in crew.js.
  const canUnlock = user.role === 'HOTC' || user.role === 'HOFO' || (user.role === 'FLIGHT_OPS_ADMIN' && c.name === 'Refresher Training');
  const status = competencyStatus(c.dueDate);
  // Not every crew member is required to hold every competency - e.g.
  // First Aid is Metro-only (mirrors the Ground School N/A
  // toggle for the same item), and some crew are exempt from CPR
  // Training. Scoped to exactly these two names rather than a
  // blanket feature.
  const canBeNa = NA_ELIGIBLE_COMPETENCIES.includes(c.name);
  // Once any date has been saved, every date field locks - a typo can no
  // longer just be typed over. Only HOTC/HOFO (or Flight Ops Admin, for
  // Refresher Training) get the "Edit dates" toggle to unlock and correct
  // it; everyone else is stuck read-only from here.
  const datesSet = !!(c.completedDate || c.dueDate || c.plannedDate);
  const datesLocked = datesSet && !(canUnlock && unlocked[c.competencyTypeId]);
  // A competency that's current collapses into a closed dropdown by
  // default, so a long list of dates that don't need attention doesn't
  // clutter the tab - anything not yet current, overdue, due soon (or, on
  // the checks that support it, in training) always stays fully open.
  const collapsible = !c.na && status === 'ok';

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontWeight: 500 }}>{c.name}</div>
      {!c.na && status && <DueBadge label="Status" info={{ dueDate: c.dueDate, status, plannedDate: c.plannedDate }} />}
    </div>
  );

  const body = (
    <>
      {canBeNa && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!c.na}
            onChange={(e) => onUpdate(c.competencyTypeId, { na: e.target.checked })}
            style={{ width: 'auto' }}
          />
          Not applicable to this crew member
        </label>
      )}
      {!c.na && (
        <>
          {datesSet && canUnlock && (
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
              <input type="date" disabled={datesLocked} defaultValue={c.completedDate || ''} onBlur={(e) => onUpdate(c.competencyTypeId, { completedDate: e.target.value || null })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Due date</label>
              <input type="date" disabled={datesLocked} defaultValue={c.dueDate || ''} onBlur={(e) => onUpdate(c.competencyTypeId, { dueDate: e.target.value || null })} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
            <label>Planned date</label>
            <input type="date" disabled={datesLocked} defaultValue={c.plannedDate || ''} onBlur={(e) => onUpdate(c.competencyTypeId, { plannedDate: e.target.value || null })} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={!!c.courseSent}
              onChange={(e) => onUpdate(c.competencyTypeId, { courseSent: e.target.checked })}
              style={{ width: 'auto' }}
            />
            Course sent to candidate
          </label>
        </>
      )}
    </>
  );

  if (collapsible) {
    return (
      <details className="card">
        <summary style={{ cursor: 'pointer' }}>{header}</summary>
        <div style={{ marginTop: 8 }}>{body}</div>
      </details>
    );
  }

  return (
    <div className="card">
      {header}
      {body}
    </div>
  );
}

// Every active competency (managed on the Syllabus tab - see
// competency-types.js) is required for every crew member automatically -
// this always shows one row per active type, whether or not any dates
// have been entered yet, rather than needing them added one at a time
// from a dropdown. Medical is pulled out and shown in the top block instead
// (see ExpiryTab) - state/fetching for both live in ExpiryTab so they share
// one source of truth rather than fetching the same data twice.
function CompetencyList({ competencies, onUpdate, unlocked, setUnlocked }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Competencies</div>

      {competencies.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No competencies set up yet - add some on the Syllabus tab.</div>
      )}
      {competencies.map((c) => (
        <CompetencyRow key={c.competencyTypeId} c={c} onUpdate={onUpdate} unlocked={unlocked} setUnlocked={setUnlocked} />
      ))}
    </div>
  );
}

// Everything with a due date lives here: recurrent check currency (EP/IPC/
// PC/Line Check) and ad-hoc competencies - kept out of the always-visible
// profile header (see the highlight badge there instead) so the page isn't
// cluttered with due-date cards nobody asked to see yet. Competency
// state/fetching lives in CrewDetail (shared with the Medical tab), not
// here, so both agree on one source of truth.
function ExpiryTab({ member, onSaved, medical, otherCompetencies, onUpdateCompetency, unlocked, setUnlocked, competencyError }) {
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
        {medical && <MedicalBox medical={medical} onUpdate={onUpdateCompetency} />}
      </div>
      {competencyError && <div className="error-text">{competencyError}</div>}

      <CompetencyList competencies={otherCompetencies} onUpdate={onUpdateCompetency} unlocked={unlocked} setUnlocked={setUnlocked} />
    </div>
  );
}

export function CrewDetail() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [error, setError] = useState(null);
  const [topTab, setTopTab] = useState('currency');
  const [competencies, setCompetencies] = useState([]);
  const [competencyError, setCompetencyError] = useState(null);
  // Once completed + planned dates are both set, the dates are locked to
  // avoid accidental edits - this remembers which rows were explicitly
  // unlocked via the "Edit dates" checkbox, reset on every reload.
  const [unlocked, setUnlocked] = useState({});

  function load() {
    api.get(`/api/crew/${id}`).then(setMember).catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  function loadCompetencies() {
    api.get(`/api/crew/${id}/competencies`).then((data) => { setCompetencies(data); load(); }).catch((e) => setCompetencyError(e.message));
  }
  useEffect(loadCompetencies, [id]);

  async function updateCompetency(competencyTypeId, patch) {
    setCompetencyError(null);
    try {
      const current = competencies.find((c) => c.competencyTypeId === competencyTypeId) || {};
      await api.put(`/api/crew/${id}/competencies/${competencyTypeId}`, {
        completedDate: current.completedDate || null,
        dueDate: current.dueDate || null,
        plannedDate: current.plannedDate || null,
        na: current.na || false,
        courseSent: current.courseSent || false,
        ...patch,
      });
      loadCompetencies();
    } catch (err) { setCompetencyError(err.message); }
  }

  // Medical sits in the top block alongside EP/IPC/PC/Line Check (it's
  // important enough to want at-a-glance, same as those), plus its own tab
  // for the full Completed/Due/Planned editing - rather than down in the
  // general Competencies list with everything else.
  const medical = competencies.find((c) => c.name === 'Medical');
  // The general Competencies list is sorted by urgency (most limiting
  // first) rather than the admin-defined Syllabus order - a competency
  // that's just been renewed and isn't due for another two years shouldn't
  // sit at the top just because of where it happens to fall in that list.
  // Not-applicable items always sort last, since they don't limit anything.
  const otherCompetencies = competencies
    .filter((c) => c.name !== 'Medical')
    .slice()
    .sort((a, b) => competencySortRank(a) - competencySortRank(b) || new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

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
  const topTabs = [
    { key: 'clearance', label: 'Clearance Form' },
    { key: 'currency', label: 'Dates' },
    { key: 'expiry', label: needsAttention ? 'Expiration ⚠' : 'Expiration' },
    ...(medical ? [{ key: 'medical', label: 'Medical' }] : []),
    ...(isPilot ? [{ key: 'licencePhoto', label: 'Licence Photo' }] : []),
  ];

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

      {topTab === 'clearance' && <ClearanceTab member={member} />}
      {topTab === 'currency' && <CurrencyFolder member={member} />}
      {topTab === 'expiry' && (
        <ExpiryTab
          member={member} onSaved={setMember} medical={medical} otherCompetencies={otherCompetencies}
          onUpdateCompetency={updateCompetency} unlocked={unlocked} setUnlocked={setUnlocked} competencyError={competencyError}
        />
      )}
      {topTab === 'medical' && medical && (
        <MedicalTab medical={medical} onUpdate={updateCompetency} unlocked={unlocked} setUnlocked={setUnlocked} error={competencyError} />
      )}
      {topTab === 'licencePhoto' && isPilot && <LicencePhotoTab member={member} onSaved={setMember} />}
    </div>
  );
}
