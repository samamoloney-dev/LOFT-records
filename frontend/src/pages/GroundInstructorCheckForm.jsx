import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';
import { isGroundInstructorCheckEligible, CHECK_ROLES } from '../lib/roles';
import { ArchiveButton } from '../components/ArchiveButton';
import { PrintButton } from '../components/PrintButton';
import { PinSignature } from '../components/PinSignature';
import { openPrintWindow, section, signatureBlock } from '../lib/print';

const COURSE_TITLES = ['Emergency procedures', 'PMI', 'Ground school'];

function ItemRow({ item, value, disabled, onChange }) {
  return (
    <div className="row" style={{ cursor: 'default' }}>
      <div style={{ flex: 1, fontSize: 13 }}>{item.description}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className={`tick-btn ${value === true ? 'active-pass' : ''}`} disabled={disabled} onClick={() => onChange(value === true ? undefined : true)}>Yes</button>
        <button className={`tick-btn ${value === false ? 'active-fail' : ''}`} disabled={disabled} onClick={() => onChange(value === false ? undefined : false)}>No</button>
      </div>
    </div>
  );
}

// SA_520 Flight Standards Personnel (Ground) Competency Check - a recurring
// (12-month) check on staff eligible to check/train Emergency Procedures
// (HOTC/HOFO/Flight Ops Admin/Examiner). Unlike the trainee check forms
// (CtlForm/LandingAssessmentForm), this is keyed to a staff member and has
// a history of past checks rather than a single record, since it must be
// renewed every year - see backend/src/routes/instructor-checks.js.
//
// Assessor and Date are entered once at the top and carried through to
// every field that needs them, instead of being retyped separately for
// the assessor's signature block and the instructor's signature block
// (previously three near-duplicate name fields and three near-duplicate
// date fields for what is really just two people and one observation).
export function GroundInstructorCheckForm({ userId, userName }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [checks, setChecks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(null);

  const canEdit = isGroundInstructorCheckEligible(user);

  useEffect(() => {
    api.get('/api/check-form-items?formKey=GROUND_INSTRUCTOR_COMPETENCY').then(setItems).catch(() => {});
    api.get('/api/users/roster').then(setStaff).catch(() => {});
  }, []);

  function load() {
    api.get(`/api/instructor-checks?userId=${userId}`).then(setChecks).catch((e) => setError(e.message));
  }
  useEffect(load, [userId]);

  async function createCheck() {
    setError(null);
    try {
      const created = await api.post('/api/instructor-checks', { userId });
      setChecks((cs) => [created, ...cs]);
      setOpenId(created.id);
    } catch (err) { setError(err.message); }
  }

  async function save(id, patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/instructor-checks/${id}`, patch);
      setChecks((cs) => cs.map((c) => (c.id === id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  function setLocal(id, patch) {
    setChecks((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function toggleItem(check, item, value) {
    const next = { ...check.items, [item.id]: check.items?.[item.id] === value ? undefined : value };
    await save(check.id, { items: next });
  }

  async function complete(check) {
    await save(check.id, { completedAt: new Date().toISOString() });
  }

  async function archiveCheck(check) {
    setError(null);
    try {
      const updated = await api.post(`/api/instructor-checks/${check.id}/archive`);
      setLocal(check.id, updated);
    } catch (err) { setError(err.message); }
  }

  async function unarchiveCheck(check) {
    setError(null);
    try {
      const updated = await api.post(`/api/instructor-checks/${check.id}/unarchive`);
      setLocal(check.id, updated);
    } catch (err) { setError(err.message); }
  }

  function onAssessorSigned(check, name, at) {
    save(check.id, name
      ? { assessorSignature: name, assessorPrintedName: name, assessorSignedDate: check.dateOfObservation || at.slice(0, 10) }
      : { assessorSignature: null });
  }

  function onInstructorSigned(check, name, at) {
    save(check.id, name
      ? { instructorSignature: name, instructorPrintedName: name, instructorSignedDate: check.dateOfObservation || at.slice(0, 10) }
      : { instructorSignature: null });
  }

  function printCheck(check) {
    let body = '<h1>Flight Standards Personnel (Ground) Competency Check</h1>';
    body += `<div class="meta">Applicant (Instructor): ${userName} · Completed ${check.completedAt ? formatDate(check.completedAt) : '—'}</div>`;
    body += section('Details', [
      ['Course Title', check.courseTitle],
      ['Date of Observation', check.dateOfObservation ? formatDate(check.dateOfObservation) : ''],
      ['Name of Assessor', check.assessorName],
    ]);
    body += section('Items', items.map((item) => [
      item.description,
      check.items?.[item.id] === true ? 'Yes' : check.items?.[item.id] === false ? 'No' : '',
    ]));
    body += signatureBlock([
      [`Assessor${check.assessorPrintedName ? ` - ${check.assessorPrintedName}` : ''}`, check.assessorSignature],
      [`Instructor${check.instructorPrintedName ? ` - ${check.instructorPrintedName}` : ''}`, check.instructorSignature],
    ]);
    openPrintWindow('Flight Standards Personnel (Ground) Competency Check', body);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 500 }}>Ground Instructor Competency Check</div>
        {canEdit && <button onClick={createCheck}>New check</button>}
      </div>
      {checks.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>No checks recorded yet.</div>
      )}
      {checks.map((check) => {
        const locked = !canEdit || !!check.completedAt;
        const open = openId === check.id;
        const allItemsAnswered = items.length > 0 && items.every((item) => check.items?.[item.id] !== undefined);
        const eligibleAssessors = staff.filter((s) => CHECK_ROLES.includes(s.role));
        return (
          <div key={check.id} className="card" style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                {check.completedAt ? `Completed ${formatDate(check.completedAt)}` : 'In progress'}
                {check.courseTitle ? ` · ${check.courseTitle}` : ''}
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
                <div className="grid2">
                  <div className="field">
                    <label>Course Title</label>
                    <select
                      disabled={locked}
                      value={check.courseTitle || ''}
                      onChange={(e) => save(check.id, { courseTitle: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {COURSE_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Date</label>
                    <input
                      type="date" disabled={locked}
                      value={check.dateOfObservation || ''}
                      onChange={(e) => save(check.id, { dateOfObservation: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Assessor</label>
                  <select
                    disabled={locked}
                    value={check.assessorId || ''}
                    onChange={(e) => save(check.id, { assessorId: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {eligibleAssessors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {items.map((item) => (
                  <ItemRow key={item.id} item={item} value={check.items?.[item.id]} disabled={locked} onChange={(v) => toggleItem(check, item, v)} />
                ))}

                <div className="grid2" style={{ marginTop: 8 }}>
                  {check.assessorId ? (
                    <PinSignature
                      label="Assessor signature" personType="user" personId={check.assessorId}
                      signedName={check.assessorSignature} signedAt={check.assessorSignedDate}
                      disabled={locked} onSigned={(name, at) => onAssessorSigned(check, name, at)}
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Select an assessor above before signing.</div>
                  )}
                  <PinSignature
                    label="Instructor signature" personType="user" personId={userId}
                    signedName={check.instructorSignature} signedAt={check.instructorSignedDate}
                    disabled={locked} onSigned={(name, at) => onInstructorSigned(check, name, at)}
                  />
                </div>

                {canEdit && !check.completedAt && !allItemsAnswered && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                    Every item above must be ticked before the check can be completed.
                  </div>
                )}
                {canEdit && !check.completedAt && (
                  <button className="primary" onClick={() => complete(check)} disabled={!allItemsAnswered} style={{ marginTop: 8 }}>Complete check</button>
                )}
              </div>
            )}
          </div>
        );
      })}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
