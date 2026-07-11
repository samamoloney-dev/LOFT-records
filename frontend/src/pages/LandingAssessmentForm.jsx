import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatUserRole } from '../lib/format';
import { LANDING_ASSESSMENT_EDIT_ROLES } from '../lib/roles';
import { ArchiveButton } from '../components/ArchiveButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock } from '../lib/print';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
const OBSERVATION_COUNT = 4;
const DEMONSTRATION_COUNT = 6;

function padded(list, count) {
  const arr = Array.isArray(list) ? list : [];
  return Array.from({ length: count }, (_, i) => arr[i] || {});
}

// Only HOTC/HOFO/Flight Ops Admin can assign this (mirrors AssignedToPicker),
// but eligibility itself is purely role-based (Check Captain or Examiner) -
// there's no per-staff opt-in tick for this check type like the others have.
function LandingAssessmentAssigneePicker({ value, fleet, disabled, onAssign }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/api/users').then(setStaff).catch(() => {});
  }, [isAdmin]);

  if (!isAdmin) return null;

  const eligible = staff.filter((s) => LANDING_ASSESSMENT_EDIT_ROLES.includes(s.role) && (!fleet || (s.fleets || []).includes(fleet)));

  return (
    <div className="field">
      <label>Assign to</label>
      <select
        disabled={disabled}
        value={value || ''}
        onChange={(e) => onAssign(eligible.find((s) => s.id === e.target.value) || null)}
      >
        <option value="">— Unassigned —</option>
        {eligible.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatUserRole(s.role)})</option>)}
      </select>
    </div>
  );
}

// Observation sectors are a simple log of which sectors the candidate flew
// as an observer - no per-sector conditions/comments, per the operator's
// updated SA_575 form.
function ObservationSector({ index, value, disabled, onChange }) {
  const v = value || {};
  const update = (field, fieldValue) => onChange(index, { ...v, [field]: fieldValue });

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Sector {index + 1}</div>
      <div className="grid2">
        <div className="field"><label>Date</label><input type="date" disabled={disabled} value={v.date || ''} onChange={(e) => update('date', e.target.value)} /></div>
        <div className="field"><label>Route</label><input disabled={disabled} value={v.route || ''} onChange={(e) => update('route', e.target.value)} /></div>
      </div>
    </div>
  );
}

// Demonstration - up to 6 flights (minimum 3 take-offs and 3 landings),
// each with its own take-off/landing result, airport/runway/wind, and an
// overall Competent judgement.
function DemonstrationSector({ index, value, disabled, onChange }) {
  const v = value || {};
  const update = (field, fieldValue) => onChange(index, { ...v, [field]: fieldValue });

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Flight {index + 1}</div>
      <div className="grid2">
        <div className="field"><label>Date</label><input type="date" disabled={disabled} value={v.date || ''} onChange={(e) => update('date', e.target.value)} /></div>
        <div className="field"><label>Airport</label><input disabled={disabled} value={v.airport || ''} onChange={(e) => update('airport', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field"><label>Rwy</label><input disabled={disabled} value={v.rwy || ''} onChange={(e) => update('rwy', e.target.value)} /></div>
        <div className="field"><label>Wind</label><input disabled={disabled} value={v.wind || ''} onChange={(e) => update('wind', e.target.value)} /></div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Take-Off</label>
          <select disabled={disabled} value={v.takeOff || ''} onChange={(e) => update('takeOff', e.target.value)}>
            <option value="">—</option>
            <option value="S">Satisfactory</option>
            <option value="X">Take over required</option>
          </select>
        </div>
        <div className="field">
          <label>Land</label>
          <select disabled={disabled} value={v.land || ''} onChange={(e) => update('land', e.target.value)}>
            <option value="">—</option>
            <option value="S">Satisfactory</option>
            <option value="X">Take over required</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Competent</label>
        <select disabled={disabled} value={v.competent || ''} onChange={(e) => update('competent', e.target.value)}>
          <option value="">—</option>
          <option value="YES">Yes</option>
          <option value="NO">No</option>
        </select>
      </div>
    </div>
  );
}

// Initial Take-Off & Landing Assessment (SA_575) - a one-time record for
// Fokker 100/Dash 8 pilot trainees, tracked independently of Check to Line
// (not a gate on it). Only a Check Captain or Examiner can fill it in and
// sign the release to normal ops; HOTC/HOFO/Flight Ops Admin can view it
// and assign it, same as every other trainee tab.
export function LandingAssessmentForm({ traineeId, fleet }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  function load() {
    api.get(`/api/landing-assessment/${traineeId}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [traineeId]);

  const canEdit = LANDING_ASSESSMENT_EDIT_ROLES.includes(user.role);
  const form = data?.form || { observationSectors: [], demonstrationSectors: [], comments: '', releaseSignature: '', releaseDate: '', exempt: false, hotcHofoSignature: '' };
  const locked = !canEdit || !!form.completedAt;

  async function save(patch) {
    setError(null);
    try {
      const updated = await api.put(`/api/landing-assessment/${traineeId}`, patch);
      setData((d) => ({ ...d, form: updated }));
    } catch (err) { setError(err.message); }
  }

  function updateObservation(index, sector) {
    const next = padded(form.observationSectors, OBSERVATION_COUNT);
    next[index] = sector;
    save({ observationSectors: next });
  }

  function updateDemonstration(index, sector) {
    const next = padded(form.demonstrationSectors, DEMONSTRATION_COUNT);
    next[index] = sector;
    save({ demonstrationSectors: next });
  }

  async function assign(staffMember) {
    await save({ assignedTo: staffMember?.id || null });
  }

  async function complete() {
    setError(null);
    try {
      const updated = await api.post(`/api/landing-assessment/${traineeId}/complete`);
      setData((d) => ({ ...d, form: updated }));
    } catch (err) { setError(err.message); }
  }

  async function archiveForm() {
    setError(null);
    try {
      const updated = await api.post(`/api/landing-assessment/${traineeId}/archive`);
      setData((d) => ({ ...d, form: { ...d.form, ...updated } }));
    } catch (err) { setError(err.message); }
  }

  async function unarchiveForm() {
    setError(null);
    try {
      const updated = await api.post(`/api/landing-assessment/${traineeId}/unarchive`);
      setData((d) => ({ ...d, form: { ...d.form, ...updated } }));
    } catch (err) { setError(err.message); }
  }

  if (!data) return null;

  function printForm() {
    let body = '<h1>Initial Take-Off & Landing Assessment</h1>';
    body += `<div class="meta">Completed ${form.completedAt ? formatDate(form.completedAt) : '—'} · ${form.assignedToName ? `${form.assignedToRole ? formatUserRole(form.assignedToRole) : 'Assigned to'} ${form.assignedToName}${form.assignedToArn ? ` (ARN ${form.assignedToArn})` : ''}` : 'Unassigned'}</div>`;
    padded(form.observationSectors, OBSERVATION_COUNT).forEach((s, i) => {
      body += section(`Observation - Sector ${i + 1}`, [['Date', s.date], ['Route', s.route]]);
    });
    padded(form.demonstrationSectors, DEMONSTRATION_COUNT).forEach((s, i) => {
      body += section(`Demonstration - Flight ${i + 1}`, [
        ['Date', s.date], ['Airport', s.airport], ['Rwy', s.rwy], ['Wind', s.wind],
        ['Take-Off', s.takeOff === 'X' ? 'Take over required' : s.takeOff === 'S' ? 'Satisfactory' : ''],
        ['Land', s.land === 'X' ? 'Take over required' : s.land === 'S' ? 'Satisfactory' : ''],
        ['Competent', s.competent === 'YES' ? 'Yes' : s.competent === 'NO' ? 'No' : ''],
      ]);
    });
    body += section('Comments / Observations', [['Comments', form.comments]]);
    body += section('Release', [
      ['Exempt', form.exempt ? 'Yes' : 'No'],
      ['HOTC/HOFO signature', form.hotcHofoSignature],
      ['Release date', form.releaseDate],
    ]);
    body += signatureBlock([['Sign to release Candidate to normal LOFT (Check Captain)', form.releaseSignature]]);
    openPrintWindow('Initial Take-Off & Landing Assessment', body);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 500 }}>Initial Take-Off & Landing Assessment</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(form.archived || form.completedAt) && <PrintButton onPrint={printForm} />}
          <ArchiveButton
            archived={form.archived}
            canArchive={!!form.completedAt}
            onArchive={archiveForm}
            onUnarchive={unarchiveForm}
          />
          <button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Open'}</button>
        </div>
      </div>
      {form.completedAt && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Completed {formatDate(form.completedAt)}</div>}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
        {form.assignedToName ? `${form.assignedToRole ? formatUserRole(form.assignedToRole) : 'Assigned to'} ${form.assignedToName}${form.assignedToArn ? ` · ARN ${form.assignedToArn}` : ''}` : 'Unassigned'}
      </div>
      <LandingAssessmentAssigneePicker value={form.assignedTo} fleet={fleet} onAssign={assign} />
      {!canEdit && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
          Only a Check Captain or Examiner can fill in and sign off this assessment.
        </div>
      )}

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Observation</div>
          {padded(form.observationSectors, OBSERVATION_COUNT).map((s, i) => (
            <ObservationSector key={i} index={i} value={s} disabled={locked} onChange={updateObservation} />
          ))}

          <div style={{ fontWeight: 500, margin: '1rem 0 6px' }}>Demonstration</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>Minimum 3 take-offs and 3 landings</div>
          {padded(form.demonstrationSectors, DEMONSTRATION_COUNT).map((s, i) => (
            <DemonstrationSector key={i} index={i} value={s} disabled={locked} onChange={updateDemonstration} />
          ))}

          <div className="field">
            <label>Comments / Observations</label>
            <textarea
              disabled={locked}
              value={form.comments || ''}
              onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, comments: e.target.value } }))}
              onBlur={() => save({ comments: form.comments })}
              style={{ minHeight: 80 }}
            />
          </div>

          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Release to normal LOFT</div>
            <div className="grid2">
              <div className="field">
                <label>Sign to release Candidate to normal LOFT (Check Captain)</label>
                <input disabled={locked} value={form.releaseSignature || ''} onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, releaseSignature: e.target.value } }))} onBlur={() => save({ releaseSignature: form.releaseSignature })} />
              </div>
              <div className="field">
                <label>Date</label>
                <input type="date" disabled={locked} value={form.releaseDate || ''} onChange={(e) => save({ releaseDate: e.target.value })} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: locked ? 'default' : 'pointer' }}>
                <input type="checkbox" disabled={locked} checked={!!form.exempt} onChange={(e) => save({ exempt: e.target.checked })} style={{ width: 'auto' }} />
                Exempt
              </label>
            </div>
            {form.exempt && (
              <div className="field">
                <label>HOTC/HOFO Signature</label>
                <input disabled={locked} value={form.hotcHofoSignature || ''} onChange={(e) => setData((d) => ({ ...d, form: { ...d.form, hotcHofoSignature: e.target.value } }))} onBlur={() => save({ hotcHofoSignature: form.hotcHofoSignature })} />
              </div>
            )}
          </div>

          {canEdit && !form.completedAt && (
            <button className="primary" onClick={complete} disabled={!((form.releaseSignature && form.releaseDate) || (form.exempt && form.hotcHofoSignature))}>
              Complete assessment
            </button>
          )}
          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </div>
  );
}
