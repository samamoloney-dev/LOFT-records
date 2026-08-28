import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLES } from '../lib/checkAccess';
import { EpChecks } from './EpChecks';
import { SafetyEquipmentCheckForm } from './SafetyEquipmentChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { PilotLineCheck } from './PilotLineCheck';
import { ClearanceTab } from './ClearanceTab';
import { CaptainInTrainingForm } from './CaptainInTrainingForm';
import { UpgradeRecordForm } from './UpgradeRecordForm';
import { GroundInstructorCheckForm } from './GroundInstructorCheckForm';
import { PersonnelCompetencyCheckForm } from './PersonnelCompetencyCheckForm';
import { SpecialistTrainingItems } from './SpecialistTrainingItems';
import { DueBadge } from '../components/DueBadge';
import { ArchiveButton } from '../components/ArchiveButton';
import { TabBar } from '../components/TabBar';
import { formatFleet, formatTraineeRole, formatDate } from '../lib/format';
import { UPGRADE_VARIANTS, isGroundInstructorCheckEligible, PERSONNEL_AIR_COMPETENCY_ROLES } from '../lib/roles';
import { competencyStatus } from '../lib/dueStatus';
import { compressImage } from '../lib/imageCompress';
import { printCrewFile } from '../lib/printCrewFile';
import { viewPdf } from '../lib/pdf';

const FLEETS = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
// Narrower than ADMIN_ROLES (excludes Alternate) - only these three can
// change the new hire flag, per the operator's explicit request. Mirrors
// backend/src/routes/crew.js's own NEW_HIRE_TOGGLE_ROLES.
const NEW_HIRE_TOGGLE_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

// Mirrors CurrencyOverview.jsx's STATUS_ORDER - overdue/not-yet-completed
// first, then the three graduated advance-warning bands (closest deadline
// first), then current, with Not Applicable always last since it isn't
// limiting anything.
const COMPETENCY_STATUS_ORDER = { overdue: 0, not_completed: 1, important: 2, due_soon: 3, approaching: 4, ok: 5 };
function competencySortRank(c) {
  if (c.na) return 6;
  return COMPETENCY_STATUS_ORDER[competencyStatus(c.dueDate)] ?? 6;
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
    newHirePilot: !!member.newHirePilot,
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
  const canToggleNewHire = NEW_HIRE_TOGGLE_ROLES.includes(user.role);

  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      const { newHirePilot, ...formWithoutNewHire } = form;
      const base = member.isLinked ? { role: form.role, fleets: form.fleets } : formWithoutNewHire;
      const patch = isPilot
        ? {
          ...base,
          lineCheckAnchorDate: form.lineCheckAnchorDate || null,
          captainInTraining: form.captainInTraining,
          ...(canToggleNewHire ? { newHirePilot } : {}),
        }
        : base;
      onSaved(await api.patch(`/api/crew/${member.id}`, patch));
      setEditing(false);
    } catch (err) { setError(err.message); }
  }

  if (member.archived) return null;

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
      {isPilot && canToggleNewHire && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.newHirePilot}
            onChange={(e) => setForm({ ...form, newHirePilot: e.target.checked })}
            style={{ width: 'auto' }}
          />
          New hire - hold off flagging Proficiency Check/Refresher Training as overdue until 6 months after Check to Line
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

  if (member.arn || member.archived) {
    return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>ARN {member.arn || 'Not yet entered'}</div>;
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

const RETENTION_YEARS = 4;

// The operator is required to retain a crew member's record for 4 years
// after they leave the company (archiving date) - permanent deletion is
// only ever offered once that period has actually elapsed. Mirrors the
// same rule enforced server-side in crew.js's DELETE /:id.
function eligibleForDeletion(member) {
  if (!member.archived || !member.archivedAt) return false;
  const retainUntil = new Date(member.archivedAt);
  retainUntil.setFullYear(retainUntil.getFullYear() + RETENTION_YEARS);
  return retainUntil <= new Date();
}

function DeleteArchivedCrewButton({ member, onDelete }) {
  const { user } = useAuth();
  if (!ADMIN_ROLES.includes(user.role) || !eligibleForDeletion(member)) return null;
  return (
    <button
      className="danger"
      onClick={() => {
        if (window.confirm(`Permanently delete ${member.name}'s record? The 4-year retention period has passed. This cannot be undone.`)) onDelete();
      }}
    >Delete permanently</button>
  );
}

// HOTC/HOFO/Flight Ops Admin only (this whole page is admin-gated already) -
// notes a planned date for an upcoming recurrent check, purely informational
// and distinct from the computed due date. Surfaced via DueBadge and
// Currency Overview as "Planned for X".
function PlannedDateEditor({ crewMemberId, checkKey, plannedDate, onSaved, disabled }) {
  const [value, setValue] = useState(plannedDate ? plannedDate.slice(0, 10) : '');
  useEffect(() => setValue(plannedDate ? plannedDate.slice(0, 10) : ''), [plannedDate]);

  // Was saving straight to the server on every onChange - typing a year
  // digit by digit fires onChange on every keystroke, including
  // intermediate states the browser reports as empty before the year is
  // fully typed, and the resulting round-trip reset this controlled input
  // back to blank mid-type (see DocumentRow's identical fix above). Only
  // commits on blur now.
  async function commit() {
    const current = plannedDate ? plannedDate.slice(0, 10) : '';
    if (value === current) return;
    const updated = await api.put(`/api/crew/${crewMemberId}/planned-checks/${checkKey}`, { plannedDate: value || null });
    onSaved(updated);
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Plan a date</label>
      <input type="date" value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={commit} style={{ fontSize: 11, padding: '4px 6px' }} />
    </div>
  );
}

// HOTC/HOFO/Flight Ops Admin only - a fixed-choice note explaining why a
// check is currently overdue, independent of whether a date's been booked
// in yet. Only shown once a check is actually overdue - reuses the same
// crew_planned_checks row PlannedDateEditor writes to (see crew.js).
// Mirrors backend/src/routes/crew.js's OVERDUE_REASONS enum.
const OVERDUE_REASONS = ['In LOFT', 'Sick Leave', 'Personal Leave', 'Failed Check'];
function ReasonEditor({ crewMemberId, checkKey, reason, onSaved, disabled }) {
  async function commit(value) {
    if (value === (reason || '')) return;
    const updated = await api.put(`/api/crew/${crewMemberId}/planned-checks/${checkKey}`, { reason: value || null });
    onSaved(updated);
  }

  return (
    <div style={{ marginTop: 6 }}>
      <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Reason overdue</label>
      <select
        value={reason || ''} disabled={disabled} onChange={(e) => commit(e.target.value)}
        style={{ fontSize: 11, padding: '4px 6px', width: 180 }}
      >
        <option value="">—</option>
        {OVERDUE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  );
}

// Medical, styled to match the other boxes in this row (DueBadge + a
// compact "Plan a date" input) rather than the fuller Competencies-list
// card - actually editing Completed/Due dates now happens on the dedicated
// Medical tab (see MedicalTab below); this stays a read-only-plus-planning
// summary, same as EP/IPC/PC/Line Check's boxes work (their due/completed
// dates aren't editable here either - only planning an upcoming date is).
function MedicalBox({ medical, onUpdate, disabled }) {
  const status = competencyStatus(medical.dueDate);
  const [value, setValue] = useState(medical.plannedDate ? medical.plannedDate.slice(0, 10) : '');
  useEffect(() => setValue(medical.plannedDate ? medical.plannedDate.slice(0, 10) : ''), [medical.plannedDate]);

  // Same fix as PlannedDateEditor above - only commits on blur, not on
  // every keystroke, so typing a year doesn't get reset mid-type.
  async function savePlanned() {
    const current = medical.plannedDate ? medical.plannedDate.slice(0, 10) : '';
    if (value === current) return;
    await onUpdate(medical.competencyTypeId, { plannedDate: value || null });
  }

  return (
    <div>
      <DueBadge label="Medical" info={{ dueDate: medical.dueDate, status, completedDate: medical.completedDate, plannedDate: medical.plannedDate }} />
      <div style={{ marginTop: 4 }}>
        <label style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Plan a date</label>
        <input type="date" value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} onBlur={savePlanned} style={{ fontSize: 11, padding: '4px 6px' }} />
      </div>
    </div>
  );
}

// Current medical certificate PDF, stored on the crew profile itself (a
// single slot, replaced rather than accumulated - see backend/src/routes/
// crew.js POST /:id/medical-document). Uploading a new one automatically
// archives whatever was there before into this crew member's Documents
// list (already archived, so it doesn't clutter their active list), which
// is exactly what the Archive page's searchable Documents tab searches -
// per the operator's explicit request that a superseded certificate stay
// findable under this crew member's name rather than being silently lost.
function MedicalDocument({ member, onSaved }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function view() {
    if (member.medicalDocument) viewPdf(member.medicalDocument);
  }

  async function upload(file) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fileData = await readFileAsDataUrl(file);
      const updated = await api.post(`/api/crew/${member.id}/medical-document`, { fileName: file.name, fileData });
      onSaved(updated);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Medical certificate</div>
      {member.medicalDocumentFileName ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{member.medicalDocumentFileName}</div>
          <button onClick={view}>View</button>
        </div>
      ) : (
        <div style={{ color: 'var(--text-secondary)', marginBottom: 10, fontSize: 13 }}>No medical certificate on file yet.</div>
      )}
      {!member.archived && (
        <>
          <div style={{ fontSize: 12, marginBottom: 4 }}>
            {busy ? 'Uploading…' : member.medicalDocumentFileName ? 'Replace with new certificate' : 'Add certificate'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Uploading a new one archives the old copy - still findable later via the Archive page's Documents search.
          </div>
          <input type="file" accept="application/pdf" disabled={busy} onChange={(e) => upload(e.target.files[0])} />
        </>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

// Full Completed/Due/Planned date editing for Medical, on its own tab
// rather than mixed into the general Competencies list (see CrewDetail) -
// reuses the same CompetencyRow the Competencies list uses for everything
// else, just scoped to the one Medical entry.
function MedicalTab({ member, medical, onUpdate, onSaved, unlocked, setUnlocked, error, archived }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Medical</div>
      {error && <div className="error-text">{error}</div>}
      <CompetencyRow c={medical} onUpdate={onUpdate} unlocked={unlocked} setUnlocked={setUnlocked} archived={archived} />
      <MedicalDocument member={member} onSaved={onSaved} />
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
        {!member.archived && (
          <>
            <div style={{ fontSize: 12, marginBottom: 4 }}>{busy ? 'Uploading…' : member.licencePhoto ? 'Replace photo' : 'Add photo'}</div>
            <input type="file" accept="image/*" disabled={busy} onChange={(e) => pickPhoto(e.target.files[0])} />
          </>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}

// Reads a File straight into a base64 data URI - same FileReader pattern as
// lib/imageCompress.js's compressImage, minus the canvas re-encode step
// (a PDF can't be re-compressed the way a camera photo can).
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

// Strips the extension and turns dashes/underscores into spaces (e.g.
// "dangerous-goods_cert.pdf" -> "dangerous goods cert") so a bulk multi-file
// upload doesn't leave every document named after its raw filename - the
// operator can still rename any of them afterward (see DocumentRow below).
function nameFromFileName(fileName) {
  return fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || fileName;
}

// Local name field with onBlur-triggered save (mirrors FlightRow.jsx's
// established safe pattern for a text field sitting inside a frequently
// re-rendered list - saving on every keystroke via a direct value+onChange
// here caused exactly this kind of field to lose characters mid-type
// elsewhere in this app, see Phase4Form.jsx/CtlForm.jsx's SectorFields fix).
function DocumentRow({ doc, member, onView, onRename, onArchive, onUnarchive, onRemove }) {
  const [name, setName] = useState(doc.name);
  useEffect(() => setName(doc.name), [doc.name]);

  return (
    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <input
          value={name} disabled={member.archived} style={{ fontWeight: 500 }}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== doc.name) onRename(doc, name.trim()); else setName(doc.name); }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          {doc.fileName} · Added {formatDate(doc.createdAt)}{doc.uploadedByName ? ` by ${doc.uploadedByName}` : ''}
          {doc.archived && doc.archivedAt ? ` · Archived ${formatDate(doc.archivedAt)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onView(doc)}>View</button>
        {doc.archived ? (
          !member.archived && <button onClick={() => onUnarchive(doc)}>Unarchive</button>
        ) : (
          <>
            {!member.archived && <button onClick={() => onArchive(doc)}>Archive</button>}
            {!member.archived && <button className="danger" onClick={() => onRemove(doc)}>Delete</button>}
          </>
        )}
      </div>
    </div>
  );
}

// Scanned documents (certificates, licences, contracts, whatever paperwork
// the operator needs on file - renamed from "Certificates" since it's
// broader than certifications alone) - the operator imports a PDF per
// document and can reopen it later. Unlike Licence Photo (a single slot)
// this is an open-ended list, closer in shape to Specialist Training's
// photos - but its own tab, since it applies to every crew member (pilot
// and cabin attendant alike), not just pilots. Purely filed evidence, no
// date/status tracking of its own - a document proves a competency was
// completed, and the competency (see CompetenciesTab) is what carries the
// due date, per the operator's explicit request once one-off competencies
// could be assigned directly to a crew member.
function DocumentsTab({ member }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  function load() {
    setLoading(true);
    api.get(`/api/crew/${member.id}/documents?archived=${showArchived}`)
      .then(setDocuments)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [member.id, showArchived]);

  // Accepts one file or many - a single file still respects the typed
  // Document name above (so the existing single-upload flow feels
  // unchanged), but multiple files are always named from their own
  // filenames, since typing one name for a batch wouldn't make sense.
  // Uploaded sequentially (not Promise.all) so "Uploading 3 of 12…" is
  // meaningful and a failure partway through doesn't silently interleave
  // with ones still in flight.
  async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(files.length > 1 ? { done: i, total: files.length } : null);
        const file = files[i];
        const docName = files.length === 1 && name.trim() ? name.trim() : nameFromFileName(file.name);
        const fileData = await readFileAsDataUrl(file);
        await api.post(`/api/crew/${member.id}/documents`, { name: docName, fileName: file.name, fileData });
      }
      setName('');
      load();
    } catch (err) { setError(err.message); } finally { setBusy(false); setProgress(null); }
  }

  async function view(doc) {
    setError(null);
    try {
      const full = await api.get(`/api/crew/${member.id}/documents/${doc.id}`);
      viewPdf(full.fileData);
    } catch (err) { setError(err.message); }
  }

  async function rename(doc, newName) {
    setError(null);
    try {
      const updated = await api.patch(`/api/crew/${member.id}/documents/${doc.id}`, { name: newName });
      setDocuments((ds) => ds.map((d) => (d.id === doc.id ? updated : d)));
    } catch (err) { setError(err.message); }
  }

  async function archive(doc) {
    setError(null);
    try {
      await api.post(`/api/crew/${member.id}/documents/${doc.id}/archive`);
      setDocuments((ds) => ds.filter((d) => d.id !== doc.id));
    } catch (err) { setError(err.message); }
  }

  async function unarchive(doc) {
    setError(null);
    try {
      await api.post(`/api/crew/${member.id}/documents/${doc.id}/unarchive`);
      setDocuments((ds) => ds.filter((d) => d.id !== doc.id));
    } catch (err) { setError(err.message); }
  }

  async function remove(doc) {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.delete(`/api/crew/${member.id}/documents/${doc.id}`);
      setDocuments((ds) => ds.filter((d) => d.id !== doc.id));
    } catch (err) { setError(err.message); }
  }

  if (loading) return <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Scanned documents on file for this crew member - imported as PDFs, click a document to view it.
        </div>
        <button onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Show active' : 'Show archived'}</button>
      </div>

      {!member.archived && !showArchived && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="field">
            <label>Document name</label>
            <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dangerous Goods Certificate" />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
              Only used when importing a single file - select several PDFs at once and each is named from its own filename instead (rename any of them afterward below).
            </div>
          </div>
          <div className="field">
            <label>{busy ? (progress ? `Uploading ${progress.done + 1} of ${progress.total}…` : 'Uploading…') : 'Import PDF(s)'}</label>
            <input
              type="file" accept="application/pdf" multiple disabled={busy}
              onChange={(e) => { const files = [...e.target.files]; e.target.value = ''; uploadFiles(files); }}
            />
          </div>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}

      {documents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          {showArchived ? 'No archived documents.' : 'No documents on file yet.'}
        </div>
      ) : documents.map((doc) => (
        <DocumentRow
          key={doc.id} doc={doc} member={member}
          onView={view} onRename={rename}
          onArchive={archive} onUnarchive={unarchive} onRemove={remove}
        />
      ))}
    </div>
  );
}

// Emergency Procedures, grouped with the 3 safety-equipment checks (Life
// Jacket, Smoke & Fire Training, F100 Slide Training) that share its exact
// authority rules and are conducted the same way - per the operator's
// explicit request that all four live together under one tab, matching the
// operator's own Skippers certificate template, which certifies all of
// them together too (see printBuilders.js buildSafetyEquipmentCertificateHtml).
// F100 Slide Training only offered for a crew member actually on the Fokker
// 100 fleet - mirrors crew.js safetyEquipmentCurrency's own fleet scoping.
function EmergencyProceduresGroup({ member, showArchived }) {
  const isFokker100 = member.fleets.includes('FOKKER_100') || member.fleets.includes('CA_FOKKER_100');
  const innerTabs = [
    { key: 'ep', label: 'Emergency Procedures' },
    { key: 'lifeJacket', label: 'Life Jacket' },
    { key: 'smokeFire', label: 'Smoke & Fire Training' },
    ...(isFokker100 ? [{ key: 'f100Slide', label: 'F100 Slide Training' }] : []),
  ];
  const [innerTab, setInnerTab] = useState('ep');
  const name = member.name;
  const fleet = member.fleets.length === 1 ? member.fleets[0] : undefined;

  return (
    <div>
      <TabBar tabs={innerTabs} active={innerTab} onSelect={setInnerTab} />
      {innerTab === 'ep' && <EpChecks appliesTo={member.type} crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
      {innerTab === 'lifeJacket' && <SafetyEquipmentCheckForm configKey="LIFE_JACKET" appliesTo={member.type} crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
      {innerTab === 'smokeFire' && <SafetyEquipmentCheckForm configKey="SMOKE_FIRE_TRAINING" appliesTo={member.type} crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
      {innerTab === 'f100Slide' && isFokker100 && <SafetyEquipmentCheckForm configKey="F100_SLIDE_TRAINING" appliesTo={member.type} crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
    </div>
  );
}

// Recurrent checks archived from here (once redone/superseded) still need to
// be visible from this person's own profile, not just the general Archive
// tab - this toggle flips the archived prop the check list already supports.
function CurrencyFolder({ member, initialSubTab }) {
  const isPilot = member.type === 'PILOT';
  // Drives this sub-tab's own "⚠" - Emergency Procedures plus the 3
  // safety-equipment checks grouped with it (see EmergencyProceduresGroup/
  // crew.js urgentSafetyEquipmentItemsFor), independent of the Expiration/
  // Competencies tabs' own warning icons.
  const epLabel = member.urgentSafetyEquipmentItems?.length > 0 ? 'Emergency Procedures ⚠' : 'Emergency Procedures';
  const subTabs = isPilot
    ? [
      { key: 'ep', label: epLabel }, { key: 'ipc', label: 'IPC' }, { key: 'pc', label: 'Proficiency Check' }, { key: 'linecheck', label: 'Line Check' },
      // Only shown once an admin has allocated this pilot to a Captain
      // upgrade (see CrewInfoEditor) - not offered to every pilot.
      ...(member.captainInTraining ? [{ key: 'citPrelim', label: 'CIT Preliminary' }, { key: 'citFinal', label: 'CIT Final' }] : []),
    ]
    : [{ key: 'ep', label: epLabel }, { key: 'linecheck', label: 'Line Check' }];
  const [subTab, setSubTab] = useState(subTabs.some((t) => t.key === initialSubTab) ? initialSubTab : 'ep');
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

      {subTab === 'ep' && <EmergencyProceduresGroup member={member} showArchived={showArchived} />}
      {subTab === 'ipc' && isPilot && <ProficiencyChecks variant="IPC_PC" label="IPC" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
      {subTab === 'pc' && isPilot && <ProficiencyChecks variant="PC" label="Proficiency Check" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
      {subTab === 'linecheck' && isPilot && <PilotLineCheck crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
      {subTab === 'linecheck' && !isPilot && <CaChecks crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
      {subTab === 'citPrelim' && isPilot && <CaptainInTrainingForm variant="PRELIMINARY" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
      {subTab === 'citFinal' && isPilot && <CaptainInTrainingForm variant="FINAL" crewMemberId={member.id} crewMemberName={name} fleet={fleet} archived={showArchived} crewArchived={member.archived} />}
    </div>
  );
}

// Ties this crew member's progression as Flight Standards staff back to
// their own profile - previously their Upgrade Record and (once linked to a
// staff account) Ground Instructor/Personnel (Air) Competency Checks were
// only reachable from the Upgrades and FS Staff pages, with nothing linking
// back here. Reuses the exact same form components those pages use, just
// scoped to this one crew member/candidate rather than a picker.
function SpecialistTrainingTab({ member }) {
  const isPilot = member.type === 'PILOT';
  // Only Captains are upgrade candidates on the pilot side (a First Officer
  // must hold Captain first, same gate UpgradePicker applies) - Cabin
  // Attendants have no equivalent rank gate.
  const upgradeVariants = isPilot
    ? (member.role === 'CAPTAIN' ? ['TRAINING_CAPTAIN', 'CHECK_CAPTAIN'] : [])
    : ['TRAINING_CABIN_ATTENDANT', 'CHECK_CABIN_ATTENDANT'];
  // GIC/PAC only apply once this crew profile is linked to a staff account
  // (see crew.js serializeCrewMember) - mirrors the same eligibility rules
  // FsStaff.jsx uses to decide showGic/showPac for a staff member's own
  // profile.
  const showGic = member.isLinked && isGroundInstructorCheckEligible({ role: member.linkedRole, checkAccess: member.linkedCheckAccess });
  const showPac = member.isLinked && PERSONNEL_AIR_COMPETENCY_ROLES.includes(member.linkedRole);
  const fleet = member.fleets.length === 1 ? member.fleets[0] : undefined;

  const subTabs = [
    ...upgradeVariants.map((v) => ({ key: v, label: UPGRADE_VARIANTS[v].label })),
    ...(showGic ? [{ key: 'gic', label: 'Ground Instructor Check' }] : []),
    ...(showPac ? [{ key: 'pac', label: 'Personnel (Air) Competency Check' }] : []),
    // Free-form additional training records (own form, name + photos) -
    // pilot-only per the operator's request, unlike the tabs above which
    // are gated on role/link rather than crew type.
    ...(isPilot ? [{ key: 'additional', label: 'Additional Training' }] : []),
  ];
  const [subTab, setSubTab] = useState(subTabs[0]?.key);

  if (subTabs.length === 0) {
    return <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No specialist training applicable to this crew member.</div>;
  }

  return (
    <div>
      <TabBar tabs={subTabs} active={subTab} onSelect={setSubTab} />
      {upgradeVariants.map((v) => subTab === v && (
        <UpgradeRecordForm key={v} variant={v} crewMemberId={member.id} crewMemberName={member.name} fleet={fleet} crewIsLinked={member.isLinked} />
      ))}
      {subTab === 'gic' && <GroundInstructorCheckForm userId={member.userId} userName={member.name} />}
      {subTab === 'pac' && <PersonnelCompetencyCheckForm userId={member.userId} userName={member.name} />}
      {subTab === 'additional' && <SpecialistTrainingItems crewMemberId={member.id} crewArchived={member.archived} />}
    </div>
  );
}

// One competency's status badge + editable dates - used by the general
// Competencies list (see CompetenciesTab). Medical is special-cased into
// its own compact MedicalBox instead (see ExpiryTab). A row is either
// catalog-driven (c.competencyTypeId set, applies to every eligible crew
// member - managed on the Syllabus tab) or a one-off ad-hoc row assigned
// to just this crew member (c.id set instead, c.competencyTypeId null -
// see the "+ Add one-off competency" form on CompetenciesTab); onUpdate/
// onDelete are handed the whole row so the caller can tell which kind it
// is and hit the right endpoint, rather than this component needing to know.
function CompetencyRow({ c, onUpdate, onDelete, unlocked, setUnlocked, archived }) {
  const { user } = useAuth();
  const isAdHoc = !c.competencyTypeId;
  // Stable per-row key for the unlock-toggle state below - competencyTypeId
  // for catalog rows, id for ad-hoc ones (competencyTypeId is null for
  // every ad-hoc row, so that alone couldn't tell two of them apart).
  const lockKey = c.competencyTypeId || c.id;
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
  // blanket feature. Never applies to an ad-hoc row - it was specifically
  // chosen for this one crew member, so "not applicable" wouldn't make
  // sense.
  const canBeNa = !isAdHoc && NA_ELIGIBLE_COMPETENCIES.includes(c.name);
  // Once any date has been saved, every date field locks - a typo can no
  // longer just be typed over. Only HOTC/HOFO (or Flight Ops Admin, for
  // Refresher Training) get the "Edit dates" toggle to unlock and correct
  // it; everyone else is stuck read-only from here. Ad-hoc rows skip this
  // extra lock entirely - the backend only requires an admin for those
  // (see crew.js's ad-hoc competency routes), not the finer-grained
  // "HOTC/HOFO only once saved" rule catalog rows have.
  const datesSet = !!(c.completedDate || c.dueDate || c.plannedDate);
  const datesLocked = archived || (!isAdHoc && datesSet && !(canUnlock && unlocked[lockKey]));
  // A competency that's current collapses into a closed dropdown by
  // default, so a long list of dates that don't need attention doesn't
  // clutter the tab - anything not yet current, overdue, due soon (or, on
  // the checks that support it, in training) always stays fully open.
  const collapsible = !c.na && status === 'ok';

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontWeight: 500 }}>{c.name}{isAdHoc && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}> · one-off</span>}</div>
      {!c.na && status && <DueBadge label="Status" info={{ dueDate: c.dueDate, status, plannedDate: c.plannedDate }} />}
    </div>
  );

  const body = (
    <>
      {canBeNa && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            disabled={archived}
            checked={!!c.na}
            onChange={(e) => onUpdate(c, { na: e.target.checked })}
            style={{ width: 'auto' }}
          />
          Not applicable to this crew member
        </label>
      )}
      {!c.na && (
        <>
          {!isAdHoc && datesSet && canUnlock && !archived && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={!!unlocked[lockKey]}
                onChange={(e) => setUnlocked((u) => ({ ...u, [lockKey]: e.target.checked }))}
                style={{ width: 'auto' }}
              />
              Edit dates
            </label>
          )}
          <div className="grid2" style={{ marginTop: 8 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Completed date</label>
              <input type="date" disabled={datesLocked} defaultValue={c.completedDate || ''} onBlur={(e) => onUpdate(c, { completedDate: e.target.value || null })} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Due date</label>
              <input type="date" disabled={datesLocked} defaultValue={c.dueDate || ''} onBlur={(e) => onUpdate(c, { dueDate: e.target.value || null })} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
            <label>Planned date</label>
            <input type="date" disabled={datesLocked} defaultValue={c.plannedDate || ''} onBlur={(e) => onUpdate(c, { plannedDate: e.target.value || null })} />
          </div>
          {!isAdHoc && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                disabled={archived}
                checked={!!c.courseSent}
                onChange={(e) => onUpdate(c, { courseSent: e.target.checked })}
                style={{ width: 'auto' }}
              />
              Course sent to candidate
            </label>
          )}
        </>
      )}
      {isAdHoc && !archived && ADMIN_ROLES.includes(user.role) && (
        <button className="danger" style={{ marginTop: 8 }} onClick={() => onDelete(c)}>Remove</button>
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
// from a dropdown - plus any one-off ad-hoc rows assigned to just this
// crew member. Medical is pulled out and shown in the top block instead
// (see ExpiryTab) - state/fetching for both live in CrewDetail, shared with
// the Medical tab, so both agree on one source of truth.
function CompetencyList({ competencies, onUpdate, onDelete, unlocked, setUnlocked, archived }) {
  return (
    <div>
      {competencies.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No competencies set up yet - add some on the Syllabus tab.</div>
      )}
      {competencies.map((c) => (
        <CompetencyRow key={c.competencyTypeId || c.id} c={c} onUpdate={onUpdate} onDelete={onDelete} unlocked={unlocked} setUnlocked={setUnlocked} archived={archived} />
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
function ExpiryTab({ member, onSaved, medical, onUpdateCompetency, competencyError }) {
  const isPilot = member.type === 'PILOT';
  const archived = member.archived;

  return (
    <div>
      <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <DueBadge label="Emergency Procedures" info={member.currency.emergencyProcedures} />
          <PlannedDateEditor crewMemberId={member.id} checkKey="emergencyProcedures" plannedDate={member.currency.emergencyProcedures.plannedDate} onSaved={onSaved} disabled={archived} />
          {['overdue', 'not_completed'].includes(member.currency.emergencyProcedures.status) && (
            <ReasonEditor crewMemberId={member.id} checkKey="emergencyProcedures" reason={member.currency.emergencyProcedures.overdueReason} onSaved={onSaved} disabled={archived} />
          )}
        </div>
        {isPilot && (
          <div>
            <DueBadge label="IPC" info={member.currency.ipc} />
            <PlannedDateEditor crewMemberId={member.id} checkKey="ipc" plannedDate={member.currency.ipc.plannedDate} onSaved={onSaved} disabled={archived} />
            {['overdue', 'not_completed'].includes(member.currency.ipc.status) && (
              <ReasonEditor crewMemberId={member.id} checkKey="ipc" reason={member.currency.ipc.overdueReason} onSaved={onSaved} disabled={archived} />
            )}
          </div>
        )}
        {isPilot && (
          <div>
            <DueBadge label="Proficiency Check" info={member.currency.proficiencyCheck} />
            <PlannedDateEditor crewMemberId={member.id} checkKey="proficiencyCheck" plannedDate={member.currency.proficiencyCheck.plannedDate} onSaved={onSaved} disabled={archived} />
            {['overdue', 'not_completed'].includes(member.currency.proficiencyCheck.status) && (
              <ReasonEditor crewMemberId={member.id} checkKey="proficiencyCheck" reason={member.currency.proficiencyCheck.overdueReason} onSaved={onSaved} disabled={archived} />
            )}
          </div>
        )}
        <div>
          <DueBadge label="Line Check" info={member.currency.lineCheck} />
          <PlannedDateEditor crewMemberId={member.id} checkKey="lineCheck" plannedDate={member.currency.lineCheck.plannedDate} onSaved={onSaved} disabled={archived} />
          {['overdue', 'not_completed'].includes(member.currency.lineCheck.status) && (
            <ReasonEditor crewMemberId={member.id} checkKey="lineCheck" reason={member.currency.lineCheck.overdueReason} onSaved={onSaved} disabled={archived} />
          )}
        </div>
        {medical && <MedicalBox medical={medical} onUpdate={onUpdateCompetency} disabled={archived} />}
      </div>
      {competencyError && <div className="error-text">{competencyError}</div>}
    </div>
  );
}

// One-off competency form (name + optional Completed/Due/Planned dates) -
// assigns a competency to just this one crew member rather than every
// pilot/cabin attendant a real catalog entry (Syllabus tab) would reach,
// per the operator's explicit request for a requirement that only applies
// to specific chosen crew. Kept separate from CompetencyList so it only
// ever shows once, above the list, rather than repeating a form per row.
function AddAdHocCompetency({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [completedDate, setCompletedDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    if (!name.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await onAdd({
        name: name.trim(),
        completedDate: completedDate || null,
        dueDate: dueDate || null,
        plannedDate: plannedDate || null,
      });
      setOpen(false);
      setName(''); setCompletedDate(''); setDueDate(''); setPlannedDate('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ marginBottom: '1rem' }}>+ Add one-off competency</button>;
  }

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div style={{ fontWeight: 500, marginBottom: 8 }}>Add one-off competency</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
        Applies to this crew member only - not the whole fleet/role a Syllabus tab competency would reach.
      </div>
      <div className="field">
        <label>Name</label>
        <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="e.g. Site-Specific Induction" />
      </div>
      <div className="grid2">
        <div className="field" style={{ margin: 0 }}>
          <label>Completed date</label>
          <input type="date" disabled={busy} value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>Due date</label>
          <input type="date" disabled={busy} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 8 }}>
        <label>Planned date</label>
        <input type="date" disabled={busy} value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
      </div>
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="primary" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add'}</button>
        <button onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

// Every competency this crew member is required to hold - catalog-driven
// ones (managed on the Syllabus tab, applying to every eligible crew
// member) plus any one-off ad-hoc ones assigned to just them. Split out
// from Expiration into its own tab so a long list of competencies doesn't
// crowd out the core recurrent checks there.
function CompetenciesTab({ competencies, onUpdate, onAdd, onDelete, unlocked, setUnlocked, competencyError, archived, isAdmin }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Every competency required for this crew member.
      </div>
      {isAdmin && !archived && <AddAdHocCompetency onAdd={onAdd} />}
      {competencyError && <div className="error-text">{competencyError}</div>}
      <CompetencyList competencies={competencies} onUpdate={onUpdate} onDelete={onDelete} unlocked={unlocked} setUnlocked={setUnlocked} archived={archived} />
    </div>
  );
}

export function CrewDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const navigate = useNavigate();
  // A "due soon"/overdue row elsewhere in the app (Currency Overview, the
  // Home Dashboard) links straight here with ?top=&sub= (see lib/checkNav.js)
  // so the admin lands directly on the relevant check instead of the
  // profile root.
  const [searchParams] = useSearchParams();
  const [member, setMember] = useState(null);
  const [error, setError] = useState(null);
  // Opening a crew profile with no explicit ?top= (e.g. clicking a name on
  // the Crew list) lands on Clearance Form by default, per the operator's
  // explicit request - falls back to Check Forms for non-admin roles, who
  // can't see that tab at all (see topTabs below).
  const [topTab, setTopTab] = useState(searchParams.get('top') || (isAdmin ? 'clearance' : 'currency'));
  const initialSubTab = searchParams.get('sub');
  const [competencies, setCompetencies] = useState([]);
  const [competencyError, setCompetencyError] = useState(null);
  const [printingFile, setPrintingFile] = useState(false);
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

  // Accepts either a competencyTypeId directly (MedicalBox's own "Plan a
  // date" field, which only ever touches the Medical catalog row) or a
  // whole competency row (CompetencyRow, which could be catalog or a
  // one-off ad-hoc row - see CompetenciesTab) - dispatches to whichever
  // endpoint actually owns that row rather than the caller needing to know.
  async function updateCompetency(rowOrCompetencyTypeId, patch) {
    setCompetencyError(null);
    const isRow = typeof rowOrCompetencyTypeId === 'object';
    const row = isRow ? rowOrCompetencyTypeId : (competencies.find((c) => c.competencyTypeId === rowOrCompetencyTypeId) || {});
    try {
      if (!isRow || row.competencyTypeId) {
        const competencyTypeId = isRow ? row.competencyTypeId : rowOrCompetencyTypeId;
        await api.put(`/api/crew/${id}/competencies/${competencyTypeId}`, {
          completedDate: row.completedDate || null,
          dueDate: row.dueDate || null,
          plannedDate: row.plannedDate || null,
          na: row.na || false,
          courseSent: row.courseSent || false,
          ...patch,
        });
      } else {
        await api.put(`/api/crew/${id}/competencies/ad-hoc/${row.id}`, {
          name: row.name,
          completedDate: row.completedDate || null,
          dueDate: row.dueDate || null,
          plannedDate: row.plannedDate || null,
          ...patch,
        });
      }
      loadCompetencies();
    } catch (err) { setCompetencyError(err.message); }
  }

  async function addAdHocCompetency(data) {
    setCompetencyError(null);
    try {
      await api.post(`/api/crew/${id}/competencies/ad-hoc`, data);
      loadCompetencies();
    } catch (err) { setCompetencyError(err.message); throw err; }
  }

  async function deleteAdHocCompetency(row) {
    if (!window.confirm(`Remove "${row.name}" from this crew member?`)) return;
    setCompetencyError(null);
    try {
      await api.delete(`/api/crew/${id}/competencies/ad-hoc/${row.id}`);
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
  async function deleteMember() {
    setError(null);
    try {
      await api.delete(`/api/crew/${id}`);
      navigate('/crew');
    } catch (err) { setError(err.message); }
  }

  async function printFile() {
    setError(null);
    setPrintingFile(true);
    try { await printCrewFile(member, competencies); }
    catch (err) { setError(err.message); }
    finally { setPrintingFile(false); }
  }

  if (error) return <div className="error-text">{error}</div>;
  if (!member) return null;

  const name = member.name;
  const needsAttention = member.urgentCoreItems.length > 0;
  const competenciesNeedAttention = member.urgentCompetencyItems.length > 0;
  const topTabs = [
    // Clearance Form sign-off is HOTC/HOFO-only and the whole tab's GET is
    // blocked for Cabin Attendant Manager (see crew.js blockCaManager on
    // GET /:id/clearances) - hide the tab entirely rather than show one
    // that always errors for them.
    ...(isAdmin ? [{ key: 'clearance', label: 'Clearance Form' }] : []),
    { key: 'currency', label: 'Check Forms' },
    { key: 'expiry', label: needsAttention ? 'Expiration ⚠' : 'Expiration' },
    ...(medical ? [{ key: 'medical', label: 'Medical' }] : []),
    { key: 'competencies', label: competenciesNeedAttention ? 'Competencies ⚠' : 'Competencies' },
    ...(isPilot ? [{ key: 'licencePhoto', label: 'Licence Photo' }] : []),
    ...(isAdmin ? [{ key: 'specialistTraining', label: 'Specialist Training' }] : []),
    ...(isAdmin ? [{ key: 'documents', label: 'Documents' }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{member.fleets.map(formatFleet).join(', ')} · {formatTraineeRole(member.role)}</div>
          {member.type === 'PILOT' && <ArnDisplay member={member} onSaved={setMember} />}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button onClick={printFile} disabled={printingFile}>{printingFile ? 'Preparing…' : 'Print file'}</button>}
          <DeleteArchivedCrewButton member={member} onDelete={deleteMember} />
          <ArchiveButton archived={member.archived} canArchive={isAdmin} onArchive={archiveMember} onUnarchive={unarchiveMember} />
        </div>
      </div>

      {member.archived && (
        <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', marginBottom: '1rem' }}>
          This crew member is archived - their record is read-only and retained for 4 years. Unarchive them first to make any changes.
        </div>
      )}

      <CrewInfoEditor member={member} onSaved={setMember} />

      <TabBar tabs={topTabs} active={topTab} onSelect={setTopTab} />

      {topTab === 'clearance' && <ClearanceTab member={member} />}
      {topTab === 'currency' && <CurrencyFolder member={member} initialSubTab={initialSubTab} />}
      {topTab === 'expiry' && (
        <ExpiryTab
          member={member} onSaved={setMember} medical={medical}
          onUpdateCompetency={updateCompetency} competencyError={competencyError}
        />
      )}
      {topTab === 'medical' && medical && (
        <MedicalTab member={member} medical={medical} onUpdate={updateCompetency} onSaved={setMember} unlocked={unlocked} setUnlocked={setUnlocked} error={competencyError} archived={member.archived} />
      )}
      {topTab === 'competencies' && (
        <CompetenciesTab
          competencies={otherCompetencies} onUpdate={updateCompetency} onAdd={addAdHocCompetency} onDelete={deleteAdHocCompetency}
          unlocked={unlocked} setUnlocked={setUnlocked} competencyError={competencyError} archived={member.archived} isAdmin={isAdmin}
        />
      )}
      {topTab === 'licencePhoto' && isPilot && <LicencePhotoTab member={member} onSaved={setMember} />}
      {topTab === 'specialistTraining' && isAdmin && <SpecialistTrainingTab member={member} />}
      {topTab === 'documents' && isAdmin && <DocumentsTab member={member} />}
    </div>
  );
}
