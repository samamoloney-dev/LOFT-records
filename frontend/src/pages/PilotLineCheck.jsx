import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AssessorPicker } from '../components/AssessorPicker';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { ArchiveButton } from '../components/ArchiveButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock, resultBadge } from '../lib/print';
import { formatDate, formatUserRole } from '../lib/format';

// Recurring pilot Line Check (365 days from the initial Check to Line date,
// then every 365 days after - see backend/src/lib/currency.js). Deliberately
// much lighter than the one-time Check to Line assessment: just a date,
// assessor, result, comments and signatures. Only ever rendered scoped to
// one Crew roster member (see CrewDetail.jsx) - there's no free-text/ad-hoc
// use of this check type.
const emptyDetails = () => ({ date: '', assessorId: '', assessor: '', assessorArn: '', comments: '', assessorSig: '', candidateSig: '' });
const emptyNewForm = () => ({ ...emptyDetails(), assignedTo: '' });

export function PilotLineCheck({ crewMemberId, crewMemberName, archived = false, fleet }) {
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(emptyNewForm());
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/checks?checkType=PILOT_LINE_CHECK&archived=${archived}&crewMemberId=${crewMemberId}`)
      .then(setChecks)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [archived, crewMemberId]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    try {
      const { assignedTo, ...details } = newForm;
      await api.post('/api/checks', { checkType: 'PILOT_LINE_CHECK', appliesTo: 'PILOT', assignedTo: assignedTo || undefined, crewMemberId, details });
      setCreating(false);
      setNewForm(emptyNewForm());
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

  async function setResult(check, result) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { result, completedAt: new Date().toISOString() });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function reassign(check, staffMember) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, {
        assignedTo: staffMember?.id || null,
        details: { ...check.details, assessorId: staffMember?.id || check.details?.assessorId, assessor: staffMember?.name || check.details?.assessor, assessorArn: staffMember?.arn || check.details?.assessorArn },
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

  function printCheck(check) {
    const d = check.details || {};
    const html = `
      <h1>Line Check</h1>
      <div class="meta">${crewMemberName} · ${d.date || ''}</div>
      ${section('Details', [
        ['Assessor', d.assessor],
        ['Assessor ARN', d.assessorArn],
        ['Comments', d.comments],
        ['Overall assessment', resultBadge(check.result)],
      ])}
      ${signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]])}
    `;
    openPrintWindow(`Line Check - ${crewMemberName}`, html);
  }

  if (selected) {
    const d = selected.details || {};
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={() => setSelectedId(null)}>← Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {selected.archived && <PrintButton onPrint={() => printCheck(selected)} />}
            <ArchiveButton
              archived={selected.archived}
              canArchive={!!selected.result}
              onArchive={() => archiveCheck(selected)}
              onUnarchive={() => unarchiveCheck(selected)}
            />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 500 }}>{crewMemberName} — Line Check</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.date ? formatDate(d.date) : 'No date'}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `${selected.assignedToRole ? formatUserRole(selected.assignedToRole) : 'Assigned to'} ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType="LINE_CHECK" fleet={fleet} onAssign={(s) => reassign(selected, s)} />
        </div>

        <div className="card">
          <div className="grid2">
            <AssessorPicker value={d.assessorId} accessType="LINE_CHECK" fleet={fleet} onSelect={(s) => setAssessor(s, (patch) => patchDetails(selected, patch))} />
            <div className="field"><label>Assessor ARN</label><input value={d.assessorArn || ''} disabled /></div>
          </div>
          <div className="field"><label>Comments</label><textarea defaultValue={d.comments} onBlur={(e) => patchDetails(selected, { comments: e.target.value })} style={{ minHeight: 60 }} /></div>
          <div className="field">
            <label>Overall assessment</label>
            <select value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
              <option value="">—</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>
          <div className="grid2">
            <div className="field"><label>Assessor signature</label><input defaultValue={d.assessorSig} onBlur={(e) => patchDetails(selected, { assessorSig: e.target.value })} /></div>
            <div className="field"><label>Candidate signature</label><input defaultValue={d.candidateSig} onBlur={(e) => patchDetails(selected, { candidateSig: e.target.value })} /></div>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? 'Archived Line Checks' : 'Line Check — due 365 days from the initial Check to Line date, then every 365 days after'}</div>
        {!archived && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Log Line Check'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} required /></div>
          <AssignedToPicker
            value={newForm.assignedTo}
            accessType="LINE_CHECK"
            fleet={fleet}
            onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '', assessorId: s?.id || f.assessorId, assessor: s?.name || f.assessor, assessorArn: s?.arn || f.assessorArn }))}
          />
          <AssessorPicker value={newForm.assessorId} accessType="LINE_CHECK" fleet={fleet} onSelect={(s) => setAssessor(s, (patch) => setNewForm((f) => ({ ...f, ...patch })))} />
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {archived ? 'archived ' : ''}Line Checks yet.</div>}
      {checks.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.details?.date ? formatDate(c.details.date) : 'No date'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.details?.assessor ? `Assessor: ${c.details.assessor}` : 'No assessor'}</div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
