import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock } from '../lib/print';
import { COMPETENCY_CHECK_ASSESSOR_ROLES } from '../lib/roles';
import { visibleCheckFormItems } from '../lib/checkFormItems';

const TRAINING_CHECK_TYPES = ['LOFT', 'Check to Line', 'Line Check'];
// A Simulator Only Examiner never trains/checks on the line - their own
// SA_518 is only ever earned in the simulator, so the Training/Check Type
// options are IPC/PC instead of the line-training types above (see
// backend/src/middleware/roles.js PERSONNEL_AIR_COMPETENCY_SECTION -
// SIMULATOR_ONLY is always CHECK_PILOT, but so is CC/Check Captain, so the
// role itself (not just the section) has to be checked here).
const SIMULATOR_TRAINING_CHECK_TYPES = ['IPC', 'PC'];

export const SECTION_LABELS = {
  TRAINING_PILOT: '2a — Training Pilot',
  CHECK_PILOT: '2b — Check Pilot',
  TRAINING_CABIN_CREW: '3a — Training Cabin Crew',
  CHECK_CABIN_CREW: '3b — Check Cabin Crew',
};

// Section 1 (Preflight) and Section 4 (Debrief) apply to every check;
// the candidate's own role-specific sub-section sits between them. Items
// come back from the API with sort_order reset to 0 per section (all
// sharing fleet = NULL), so ordering has to be done here rather than
// trusting the API's raw row order.
const SECTION_PRIORITY = { PREFLIGHT: 0, DEBRIEF: 2 };

function relevantItems(items, candidateSection) {
  return items
    .filter((i) => i.section === 'PREFLIGHT' || i.section === candidateSection || i.section === 'DEBRIEF')
    .sort((a, b) => (SECTION_PRIORITY[a.section] ?? 1) - (SECTION_PRIORITY[b.section] ?? 1) || a.sortOrder - b.sortOrder);
}

function expiryDate(checkDate) {
  if (!checkDate) return null;
  const d = new Date(checkDate);
  d.setMonth(d.getMonth() + 24);
  return d.toISOString().slice(0, 10);
}

// Buffered locally, committed onBlur - same fix as UpgradeRecordForm's
// FlightRow. A date input left fully controlled off the parent's value and
// firing onChange straight into an async PATCH doesn't work: the input's
// value prop stays bound to the (not-yet-updated) parent state while the
// request is in flight, so typing/picking a date visibly doesn't stick
// until the round trip completes, and multi-segment typing can easily
// outrun it entirely.
function DateField({ value, disabled, onCommit }) {
  const [local, setLocal] = useState(value || '');
  useEffect(() => { setLocal(value || ''); }, [value]);
  return (
    <input type="date" disabled={disabled} value={local} onChange={(e) => setLocal(e.target.value)} onBlur={() => onCommit(local)} />
  );
}

function ItemRow({ item, value, disabled, onChange }) {
  return (
    <div className="row" style={{ cursor: 'default' }}>
      <div style={{ flex: 1, fontSize: 13 }}>{item.description}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className={`tick-btn ${value === 'S' ? 'active-pass' : ''}`} disabled={disabled} onClick={() => onChange(value === 'S' ? undefined : 'S')}>S</button>
        <button className={`tick-btn ${value === 'U' ? 'active-fail' : ''}`} disabled={disabled} onClick={() => onChange(value === 'U' ? undefined : 'U')}>U</button>
      </div>
    </div>
  );
}

function SectionItems({ title, items, check, disabled, onChange }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{title}</div>
      {items.map((item) => (
        <ItemRow key={item.id} item={item} value={check.items?.[item.id]} disabled={disabled} onChange={(v) => onChange(item, v)} />
      ))}
    </div>
  );
}

// The editable body of a single Personnel (Air) Competency Check record -
// Training/Check Type, Date, Assessor, item ticks, comments, signature.
// Extracted so the Upgrade Record's Check tab (see UpgradeRecordForm.jsx)
// can embed the exact same SA518 assessment the standalone Staff-profile
// page below uses, driven purely by props/onPatch rather than owning its
// own list of checks or save() plumbing.
export function PersonnelCompetencyCheckEditor({ check, userName, candidateRole, assessors, disabled, onPatch }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get('/api/check-form-items?formKey=PERSONNEL_AIR_COMPETENCY&includeArchived=true').then(setItems).catch(() => {});
  }, []);

  const trainingCheckTypes = candidateRole === 'SIMULATOR_ONLY' ? SIMULATOR_TRAINING_CHECK_TYPES : TRAINING_CHECK_TYPES;
  const locked = disabled || !!check.completedAt;
  const relevant = visibleCheckFormItems(relevantItems(items, check.candidateSection), check.items);
  const preflight = relevant.filter((i) => i.section === 'PREFLIGHT');
  const subsection = relevant.filter((i) => i.section === check.candidateSection);
  const debrief = relevant.filter((i) => i.section === 'DEBRIEF');
  const allItemsAnswered = relevant.length > 0 && relevant.every((item) => check.items?.[item.id] !== undefined);

  function toggleItem(item, value) {
    const next = { ...check.items, [item.id]: check.items?.[item.id] === value ? undefined : value };
    onPatch({ items: next });
  }

  return (
    <div>
      <div className="grid2">
        <div className="field">
          <label>Training / Check Type</label>
          <select disabled={locked} value={check.trainingCheckType || ''} onChange={(e) => onPatch({ trainingCheckType: e.target.value || null })}>
            <option value="">—</option>
            {trainingCheckTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Date</label>
          <DateField disabled={locked} value={check.checkDate ? check.checkDate.slice(0, 10) : ''} onCommit={(v) => onPatch({ checkDate: v })} />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Assessor</label>
          <select disabled={locked} value={check.assessorId || ''} onChange={(e) => onPatch({ assessorId: e.target.value || null })}>
            <option value="">—</option>
            {assessors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Candidate</label><input disabled value={userName} /></div>
      </div>
      <div className="field">
        <label>Aircraft Type</label>
        <input disabled={locked} defaultValue={check.aircraftType || ''} onBlur={(e) => onPatch({ aircraftType: e.target.value })} />
      </div>

      <SectionItems title="Section 1 — Preflight Examination" items={preflight} check={check} disabled={locked} onChange={toggleItem} />
      <SectionItems title={SECTION_LABELS[check.candidateSection] || 'Section'} items={subsection} check={check} disabled={locked} onChange={toggleItem} />
      <SectionItems title="Section 4 — Debrief" items={debrief} check={check} disabled={locked} onChange={toggleItem} />

      <div className="field" style={{ marginTop: 10 }}>
        <label>Comments</label>
        <textarea disabled={locked} rows={3} defaultValue={check.comments || ''} onBlur={(e) => onPatch({ comments: e.target.value })} />
      </div>
      <div className="field">
        <label>Recommendations</label>
        <textarea disabled={locked} rows={3} defaultValue={check.recommendations || ''} onBlur={(e) => onPatch({ recommendations: e.target.value })} />
      </div>

      {!check.completedAt && (
        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
          I certify that the purpose of this assessment as specified in E.6.16 has been achieved.
        </div>
      )}
      {check.assessorId ? (
        <PinSignature
          label="Assessor signature" personType="user" personId={check.assessorId}
          signedName={check.certifiedSignature} signedAt={check.certifiedSignedAt}
          disabled={locked || !allItemsAnswered}
          onSigned={(name, at) => onPatch({ certifiedSignature: name, certifiedSignedAt: at, completedAt: name ? at : null })}
        />
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Select an assessor above before signing.</div>
      )}
      {!check.completedAt && !allItemsAnswered && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          Every item above must be ticked S or U before the check can be signed off.
        </div>
      )}
    </div>
  );
}

export function PersonnelCompetencyCheckForm({ userId, userName }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [checks, setChecks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(null);

  const canEdit = COMPETENCY_CHECK_ASSESSOR_ROLES.includes(user.role);

  useEffect(() => {
    api.get('/api/check-form-items?formKey=PERSONNEL_AIR_COMPETENCY&includeArchived=true').then(setItems).catch(() => {});
    api.get('/api/users/roster').then(setStaff).catch(() => {});
  }, []);

  const candidate = staff.find((s) => s.id === userId);

  function load() {
    api.get(`/api/personnel-checks?userId=${userId}`).then(setChecks).catch((e) => setError(e.message));
  }
  useEffect(load, [userId]);

  async function createCheck() {
    setError(null);
    try {
      const created = await api.post('/api/personnel-checks', { userId });
      setChecks((cs) => [created, ...cs]);
      setOpenId(created.id);
    } catch (err) { setError(err.message); }
  }

  async function save(id, patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/personnel-checks/${id}`, patch);
      setChecks((cs) => cs.map((c) => (c.id === id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  function setLocal(id, patch) {
    setChecks((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function archiveCheck(check) {
    setError(null);
    try {
      const updated = await api.post(`/api/personnel-checks/${check.id}/archive`);
      setLocal(check.id, updated);
    } catch (err) { setError(err.message); }
  }

  async function unarchiveCheck(check) {
    setError(null);
    try {
      const updated = await api.post(`/api/personnel-checks/${check.id}/unarchive`);
      setLocal(check.id, updated);
    } catch (err) { setError(err.message); }
  }

  function printCheck(check) {
    const relevant = visibleCheckFormItems(relevantItems(items, check.candidateSection), check.items);
    const preflight = relevant.filter((i) => i.section === 'PREFLIGHT');
    const subsection = relevant.filter((i) => i.section === check.candidateSection);
    const debrief = relevant.filter((i) => i.section === 'DEBRIEF');
    const rowFor = (item) => [item.description, check.items?.[item.id] || ''];

    let body = '<h1>Flight Standards Personnel (Air) Competency Check</h1>';
    body += `<div class="meta">Candidate: ${userName} · ${SECTION_LABELS[check.candidateSection] || ''} · Completed ${check.completedAt ? formatDate(check.completedAt) : '—'}</div>`;
    body += section('Details', [
      ['Training / Check Type', check.trainingCheckType],
      ['Date', check.checkDate ? formatDate(check.checkDate) : ''],
      ['Assessor', check.assessorName],
      ['Expiry (24m)', check.checkDate ? formatDate(expiryDate(check.checkDate)) : ''],
      ['Aircraft Type', check.aircraftType],
    ]);
    body += section('Section 1 — Preflight Examination', preflight.map(rowFor));
    body += section(SECTION_LABELS[check.candidateSection] || 'Section', subsection.map(rowFor));
    body += section('Section 4 — Debrief', debrief.map(rowFor));
    body += section('Comments', [['Comments', check.comments], ['Recommendations', check.recommendations]]);
    body += `<div style="font-size:12px;font-style:italic;margin:0.75rem 0;">I certify that the purpose of this assessment as specified in E.6.16 has been achieved.</div>`;
    body += signatureBlock([['Assessor', check.certifiedSignature]]);
    openPrintWindow('Flight Standards Personnel (Air) Competency Check', body);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 500 }}>Flight Standards Personnel (Air) Competency Check</div>
        {canEdit && <button onClick={createCheck}>New check</button>}
      </div>
      {checks.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>No checks recorded yet.</div>
      )}
      {checks.map((check) => {
        const open = openId === check.id;
        const eligibleAssessors = staff.filter((s) => COMPETENCY_CHECK_ASSESSOR_ROLES.includes(s.role));

        return (
          <div key={check.id} className="card" style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                {check.completedAt ? `Completed ${formatDate(check.completedAt)}` : 'In progress'}
                {check.trainingCheckType ? ` · ${check.trainingCheckType}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(check.archived || check.completedAt) && <PrintButton onPrint={() => printCheck(check)} />}
                <ArchiveButton
                  archived={check.archived}
                  canArchive={!!check.completedAt}
                  onArchive={() => archiveCheck(check)}
                  onUnarchive={() => unarchiveCheck(check)}
                />
                <button onClick={() => setOpenId(open ? null : check.id)}>{open ? 'Close' : 'Open'}</button>
              </div>
            </div>

            {open && (
              <div style={{ marginTop: 8 }}>
                <PersonnelCompetencyCheckEditor
                  check={check}
                  userName={userName}
                  candidateRole={candidate?.role}
                  assessors={eligibleAssessors}
                  disabled={!canEdit}
                  onPatch={(patch) => save(check.id, patch)}
                />
              </div>
            )}
          </div>
        );
      })}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
