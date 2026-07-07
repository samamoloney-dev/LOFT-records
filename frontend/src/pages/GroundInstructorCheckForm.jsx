import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';
import { GROUND_INSTRUCTOR_CHECK_ROLES } from '../lib/roles';
import { ArchiveButton } from '../components/ArchiveButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock } from '../lib/print';

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
export function GroundInstructorCheckForm({ userId, userName }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [checks, setChecks] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState(null);

  const canEdit = GROUND_INSTRUCTOR_CHECK_ROLES.includes(user.role);

  useEffect(() => {
    api.get('/api/check-form-items?formKey=GROUND_INSTRUCTOR_COMPETENCY').then(setItems).catch(() => {});
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
        return (
          <div key={check.id} className="card" style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                {check.completedAt ? `Completed ${formatDate(check.completedAt)}` : 'In progress'}
                {check.courseTitle ? ` · ${check.courseTitle}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {check.archived && <PrintButton onPrint={() => printCheck(check)} />}
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
                    <input
                      disabled={locked}
                      value={check.courseTitle || ''}
                      onChange={(e) => setLocal(check.id, { courseTitle: e.target.value })}
                      onBlur={() => save(check.id, { courseTitle: check.courseTitle })}
                    />
                  </div>
                  <div className="field">
                    <label>Date of Observation</label>
                    <input
                      type="date" disabled={locked}
                      value={check.dateOfObservation || ''}
                      onChange={(e) => save(check.id, { dateOfObservation: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Name of Assessor</label>
                  <input
                    disabled={locked}
                    value={check.assessorName || ''}
                    onChange={(e) => setLocal(check.id, { assessorName: e.target.value })}
                    onBlur={() => save(check.id, { assessorName: check.assessorName })}
                  />
                </div>

                {items.map((item) => (
                  <ItemRow key={item.id} item={item} value={check.items?.[item.id]} disabled={locked} onChange={(v) => toggleItem(check, item, v)} />
                ))}

                <div className="grid2" style={{ marginTop: 8 }}>
                  <div className="field">
                    <label>Assessor signature</label>
                    <input
                      disabled={locked}
                      value={check.assessorSignature || ''}
                      onChange={(e) => setLocal(check.id, { assessorSignature: e.target.value })}
                      onBlur={() => save(check.id, { assessorSignature: check.assessorSignature })}
                    />
                  </div>
                  <div className="field">
                    <label>Assessor printed name</label>
                    <input
                      disabled={locked}
                      value={check.assessorPrintedName || ''}
                      onChange={(e) => setLocal(check.id, { assessorPrintedName: e.target.value })}
                      onBlur={() => save(check.id, { assessorPrintedName: check.assessorPrintedName })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Assessor date</label>
                  <input
                    type="date" disabled={locked}
                    value={check.assessorSignedDate || ''}
                    onChange={(e) => save(check.id, { assessorSignedDate: e.target.value })}
                  />
                </div>

                <div className="grid2" style={{ marginTop: 8 }}>
                  <div className="field">
                    <label>Instructor signature</label>
                    <input
                      disabled={locked}
                      value={check.instructorSignature || ''}
                      onChange={(e) => setLocal(check.id, { instructorSignature: e.target.value })}
                      onBlur={() => save(check.id, { instructorSignature: check.instructorSignature })}
                    />
                  </div>
                  <div className="field">
                    <label>Instructor printed name</label>
                    <input
                      disabled={locked}
                      value={check.instructorPrintedName || ''}
                      onChange={(e) => setLocal(check.id, { instructorPrintedName: e.target.value })}
                      onBlur={() => save(check.id, { instructorPrintedName: check.instructorPrintedName })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Instructor date</label>
                  <input
                    type="date" disabled={locked}
                    value={check.instructorSignedDate || ''}
                    onChange={(e) => save(check.id, { instructorSignedDate: e.target.value })}
                  />
                </div>

                {canEdit && !check.completedAt && (
                  <button className="primary" onClick={() => complete(check)} style={{ marginTop: 8 }}>Complete check</button>
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
