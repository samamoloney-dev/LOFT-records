import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { AssessorPicker } from '../components/AssessorPicker';
import { CrewMemberPicker } from '../components/CrewMemberPicker';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow } from '../lib/print';
import { buildFlightStandardsRecurrentTrainingHtml } from '../lib/printBuilders';
import { formatDate } from '../lib/format';
import { visibleCheckFormItems } from '../lib/checkFormItems';
import { sortNotCompletedFirst } from '../lib/sortChecks';

const emptyDetails = () => ({ name: '', date: '', assessorId: '', assessor: '', assessorArn: '', items: {}, comments: '', assessorSig: '', candidateSig: '' });
const emptyNewForm = () => ({ ...emptyDetails(), assignedTo: '' });
// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new check
// record - mirrors backend/src/routes/checks.js POST /.
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// SA 538 - pilot-only, and in practice only relevant to a pilot who is
// also an Examiner/Check Captain/Training Captain (see this component's
// linked competency_type's own staff_roles restriction in crew.js), but
// left open to any pilot here the same way EpChecks doesn't itself
// restrict which cabin crew/pilots a check can be raised for.
// Unlike every other check form, this one has no Pass/Fail on the paper
// form at all (SA 538 Rev 26/02) - completion is just every criteria
// ticked plus both signatures, then "Mark complete" sets completedAt
// directly (see checks.js's isCompletingNow handling for this checkType).
export function FlightStandardsRecurrentTraining({ archived = false, crewMemberId, crewMemberName, crewArchived = false }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(() => ({ ...emptyNewForm(), name: crewMemberName || '' }));
  const [error, setError] = useState(null);
  const [crewOptions, setCrewOptions] = useState([]);
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get('/api/check-form-items?formKey=FLIGHT_STANDARDS_RECURRENT_TRAINING&includeArchived=true').then(setItems).catch(() => {});
  }, []);

  function load() {
    api.get(`/api/checks?checkType=FLIGHT_STANDARDS_RECURRENT_TRAINING&archived=${archived}${crewMemberId ? `&crewMemberId=${crewMemberId}` : ''}`)
      .then(setChecks)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [archived, crewMemberId]);
  useEffect(() => {
    if (crewMemberId) return;
    api.get('/api/crew?type=PILOT').then(setCrewOptions).catch(() => {});
  }, [crewMemberId]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    if (!newForm.name.trim()) return;
    try {
      const { assignedTo, linkedCrewMemberId, ...details } = newForm;
      const nameMatch = !linkedCrewMemberId && crewOptions.find((m) => m.name.trim().toLowerCase() === newForm.name.trim().toLowerCase());
      await api.post('/api/checks', { checkType: 'FLIGHT_STANDARDS_RECURRENT_TRAINING', appliesTo: 'PILOT', assignedTo: assignedTo || undefined, crewMemberId: crewMemberId || linkedCrewMemberId || nameMatch?.id || undefined, details });
      setCreating(false);
      setNewForm({ ...emptyNewForm(), name: crewMemberName || '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function patchDetails(check, patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { details: { ...check.details, ...patch } });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  // No result on this check type - completion is signalled purely by
  // completedAt (see checks.js's isCompletingNow), which also drives the
  // linked "Flight Standards Pilot Recurrent Training" competency sync.
  async function markComplete(check) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { completedAt: check.details?.date || new Date().toISOString() });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function reassign(check, staffMember) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, {
        assignedTo: staffMember?.id || null,
        details: {
          ...check.details,
          assessorId: staffMember?.id || check.details?.assessorId,
          assessor: staffMember?.name || check.details?.assessor,
          assessorArn: staffMember?.arn || check.details?.assessorArn,
        },
      });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  function setAssessor(staffMember, apply) {
    apply({ assessorId: staffMember?.id || '', assessor: staffMember?.name || '', assessorArn: staffMember?.arn || '' });
  }

  async function archiveCheck(check) {
    setError(null);
    try { await api.post(`/api/checks/${check.id}/archive`); setSelectedId(null); load(); }
    catch (err) { setError(err.message); }
  }

  async function unarchiveCheck(check) {
    setError(null);
    try { await api.post(`/api/checks/${check.id}/unarchive`); setSelectedId(null); load(); }
    catch (err) { setError(err.message); }
  }

  async function deleteCheck(check) {
    setError(null);
    try { await api.delete(`/api/checks/${check.id}`); setSelectedId(null); load(); }
    catch (err) { setError(err.message); }
  }

  function printCheck(check) {
    openPrintWindow(`Flight Standards Pilot Recurrent Training - ${check.details?.name || ''}`, buildFlightStandardsRecurrentTrainingHtml(check, items));
  }

  if (selected) {
    const d = selected.details || {};
    const visibleItems = visibleCheckFormItems(items, d.items);
    const allItemsAnswered = visibleItems.length > 0 && visibleItems.every((item) => d.items?.[item.id] !== undefined);
    const readyToComplete = allItemsAnswered && !!d.assessorSig && !!d.candidateSig;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={() => setSelectedId(null)}>← Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {(selected.archived || selected.completedAt) && <PrintButton onPrint={() => printCheck(selected)} />}
            <ArchiveButton
              archived={selected.archived}
              canArchive={!!selected.completedAt}
              onArchive={() => archiveCheck(selected)}
              onUnarchive={() => unarchiveCheck(selected)}
            />
            <DeleteButton archived={selected.archived} onDelete={() => deleteCheck(selected)} />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 500 }}>{d.name} — Flight Standards Pilot Recurrent Training</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {d.date ? formatDate(d.date) : 'No date'}
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `Assigned to ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType="FLIGHT_STANDARDS_RECURRENT_TRAINING" onAssign={(s) => reassign(selected, s)} />
        </div>

        <div className="card">
          {visibleItems.map((item) => (
            <div key={item.id} className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1, fontSize: 13 }}>{item.description}</div>
              <button
                disabled={!!selected.completedAt}
                className={`tick-btn ${d.items?.[item.id] ? 'active-pass' : ''}`}
                onClick={() => patchDetails(selected, { items: { ...d.items, [item.id]: d.items?.[item.id] ? undefined : true } })}
              >✓</button>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="field">
            <label>Assessor comments</label>
            <textarea defaultValue={d.comments} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { comments: e.target.value })} style={{ minHeight: 60 }} />
          </div>
          <AssessorPicker value={d.assessorId} accessType="FLIGHT_STANDARDS_RECURRENT_TRAINING" disabled={!!selected.completedAt} onSelect={(s) => setAssessor(s, (patch) => patchDetails(selected, patch))} />
          <div className="grid2">
            {selected.assignedTo ? (
              <PinSignature
                label="Assessor signature" personType="user" personId={selected.assignedTo}
                signedName={d.assessorSig} signedAt={d.assessorSigAt} disabled={!!selected.completedAt}
                onSigned={(name, at) => patchDetails(selected, { assessorSig: name, assessorSigAt: at })}
              />
            ) : (
              <div className="field"><label>Assessor signature</label><input defaultValue={d.assessorSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { assessorSig: e.target.value })} /></div>
            )}
            {selected.crewMemberId ? (
              <PinSignature
                label="Candidate signature" personType="crewMember" personId={selected.crewMemberId}
                signedName={d.candidateSig} signedAt={d.candidateSigAt} disabled={!!selected.completedAt}
                onSigned={(name, at) => patchDetails(selected, { candidateSig: name, candidateSigAt: at })}
              />
            ) : (
              <div className="field"><label>Candidate signature</label><input defaultValue={d.candidateSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { candidateSig: e.target.value })} /></div>
            )}
          </div>
        </div>

        {!selected.completedAt && (
          <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
            DO NOT SELECT UNTIL ALL CRITERIA ARE TICKED AND BOTH SIGNATURES ARE COMPLETE. SELECTING THIS WILL LOCK THE FORM.
          </div>
        )}
        {!selected.completedAt && !readyToComplete && (
          <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Every criteria above must be ticked, and both signatures completed, before this can be marked complete.
          </div>
        )}
        {!selected.completedAt && (
          <div className="card">
            <button className="primary" disabled={!readyToComplete} onClick={() => markComplete(selected)}>Mark complete</button>
          </div>
        )}
        {selected.completedAt && (
          <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Completed {formatDate(selected.completedAt)}
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? 'Archived Flight Standards Pilot Recurrent Training checks' : 'SA 538 - assesses an examiner/training captain\'s own instructional technique during simulator sessions'}</div>
        {!archived && !crewArchived && isAdmin && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Add Flight Standards Pilot Recurrent Training'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          {!crewMemberId && (
            <CrewMemberPicker
              members={crewOptions}
              value={newForm.linkedCrewMemberId}
              onSelect={(m) => setNewForm((f) => ({ ...f, linkedCrewMemberId: m?.id || '', name: m?.name || f.name }))}
            />
          )}
          <div className="grid2">
            {crewMemberId
              ? <div className="field"><label>Candidate</label><input value={newForm.name} disabled /></div>
              : <div className="field"><label>Candidate name</label><input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} required /></div>}
            <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          </div>
          <AssignedToPicker
            value={newForm.assignedTo}
            accessType="FLIGHT_STANDARDS_RECURRENT_TRAINING"
            onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '', assessorId: s?.id || f.assessorId, assessor: s?.name || f.assessor, assessorArn: s?.arn || f.assessorArn }))}
          />
          <AssessorPicker value={newForm.assessorId} accessType="FLIGHT_STANDARDS_RECURRENT_TRAINING" onSelect={(s) => setAssessor(s, (patch) => setNewForm((f) => ({ ...f, ...patch })))} />
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {archived ? 'archived ' : ''}Flight Standards Pilot Recurrent Training checks yet.</div>}
      {sortNotCompletedFirst(checks).map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.details?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {c.details?.date ? formatDate(c.details.date) : 'No date'}
            </div>
          </div>
          {c.completedAt && <span className="badge pass">Completed</span>}
        </div>
      ))}
    </div>
  );
}
