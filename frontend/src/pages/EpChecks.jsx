import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { AssessorPicker } from '../components/AssessorPicker';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock, resultBadge } from '../lib/print';
import { formatUserRole } from '../lib/format';

const EP_TYPES = ['Theory', 'Slide', 'Life Jacket', 'Conquest', 'Metro', 'Dash8', 'Fokker 100'];
const AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];
const EP_ITEMS = [
  'Emergency Equipment Knowledge — location, duration, operation, precaution and post use',
  'Emergency Equipment Practical Demonstration',
  'Emergency Evacuation Procedures',
  'Emergency Evacuation Procedures Practical Demonstration',
  'Emergency Exit Operation',
  'Survival Knowledge',
  'Unlawful Interference',
  'Emergency Escape Slide',
];

const emptyDetails = () => ({ name: '', date: '', assessorId: '', assessor: '', assessorArn: '', actype: '', types: [], items: {}, lifeJacketDate: '', scenarios: '', comments: '', assessorSig: '', candidateSig: '' });
const emptyNewForm = () => ({ ...emptyDetails(), assignedTo: '' });

// crewMemberId/crewMemberName scope this to one Crew roster member's own
// recurring checks (see CrewDetail.jsx) instead of the free-text list used
// for ad-hoc/initial-training checks.
export function EpChecks({ appliesTo = 'CABIN_ATTENDANT', archived = false, crewMemberId, crewMemberName, fleet }) {
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(() => ({ ...emptyNewForm(), name: crewMemberName || '' }));
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/checks?checkType=EMERGENCY_PROCEDURES&archived=${archived}${crewMemberId ? `&crewMemberId=${crewMemberId}` : ''}`)
      .then((all) => setChecks(all.filter((c) => c.appliesTo === appliesTo)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [appliesTo, archived, crewMemberId]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    if (!newForm.name.trim()) return;
    try {
      const { assignedTo, ...details } = newForm;
      await api.post('/api/checks', { checkType: 'EMERGENCY_PROCEDURES', appliesTo, assignedTo: assignedTo || undefined, crewMemberId, details });
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
    const d = check.details || {};
    const itemRows = EP_ITEMS.map((item, i) => [item, d.items?.[i] === 'S' ? '✓' : d.items?.[i] === 'X' ? '✗' : d.items?.[i] === 'N' ? 'N (Not Tested)' : '']);
    const html = `
      <h1>Emergency Procedures Check</h1>
      <div class="meta">${d.name || ''} · ${d.date || ''} · ${(d.types || []).join(', ') || 'No type selected'}</div>
      ${section('Details', [
        ['Aircraft type', d.actype],
        ['Assessor', d.assessor],
        ['Assessor ARN', d.assessorArn],
        ['Assigned to', check.assignedToName ? `${check.assignedToName}${check.assignedToArn ? ` (ARN ${check.assignedToArn})` : ''}` : 'Unassigned'],
      ])}
      ${section('Assessment items', itemRows)}
      ${section('Assessment', [
        ['Life Jacket Training (Wet Drill) date', d.lifeJacketDate],
        ['Scenarios selected', d.scenarios],
        ['Comments', d.comments],
        ['Overall assessment', resultBadge(check.result)],
        ['Overall score', check.score],
      ])}
      <div class="disclaimer">We, the undersigned, do hereby mutually agree upon and accept the comment written in this document as being a correct and honest account of the performance of the Applicant in each and every procedure carried out.</div>
      ${signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]])}
    `;
    openPrintWindow(`EP Check - ${d.name || ''}`, html);
  }

  function toggleType(type) {
    setNewForm((f) => ({
      ...f,
      types: f.types.includes(type) ? f.types.filter((t) => t !== type) : [...f.types, type],
    }));
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
            <DeleteButton archived={selected.archived} onDelete={() => deleteCheck(selected)} />
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 500 }}>{d.name} — Emergency Procedures Check</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(d.types || []).join(', ') || 'No type selected'}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `${selected.assignedToRole ? formatUserRole(selected.assignedToRole) : 'Assigned to'} ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType="EMERGENCY_PROCEDURES" fleet={fleet} onAssign={(s) => reassign(selected, s)} />
        </div>

        <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
          All items below are mandatory. Every line must contain an entry or be marked N (Not Tested).
        </div>

        <div className="card">
          {EP_ITEMS.map((item, i) => (
            <div key={i} className="row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1, fontSize: 13 }}>{item}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['S', 'X', 'N'].map((v) => (
                  <button
                    key={v}
                    disabled={!!selected.completedAt}
                    className={`tick-btn ${d.items?.[i] === v ? (v === 'X' ? 'active-fail' : 'active-pass') : ''}`}
                    onClick={() => patchDetails(selected, { items: { ...d.items, [i]: d.items?.[i] === v ? undefined : v } })}
                  >{v === 'S' ? '✓' : v === 'X' ? '✗' : 'N'}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="field">
            <label>Life Jacket Training (Wet Drill) date — initial qualification only</label>
            <input type="date" defaultValue={d.lifeJacketDate} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { lifeJacketDate: e.target.value })} />
          </div>
        </div>

        <div className="card">
          <div className="field">
            <label>Scenarios selected for the assessment</label>
            <textarea defaultValue={d.scenarios} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { scenarios: e.target.value })} style={{ minHeight: 60 }} />
          </div>
          <div className="field">
            <label>Comments</label>
            <textarea defaultValue={d.comments} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { comments: e.target.value })} style={{ minHeight: 60 }} />
          </div>
          <div className="grid2">
            <AssessorPicker value={d.assessorId} accessType="EMERGENCY_PROCEDURES" fleet={fleet} disabled={!!selected.completedAt} onSelect={(s) => setAssessor(s, (patch) => patchDetails(selected, patch))} />
            <div className="field"><label>Assessor ARN</label><input value={d.assessorArn || ''} disabled /></div>
          </div>
          <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
            We, the undersigned, do hereby mutually agree upon and accept the comment written in
            this document as being a correct and honest account of the performance of the
            Applicant in each and every procedure carried out.
          </div>
          <div className="grid2">
            <div className="field"><label>Assessor signature</label><input defaultValue={d.assessorSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { assessorSig: e.target.value })} /></div>
            <div className="field"><label>Candidate signature</label><input defaultValue={d.candidateSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { candidateSig: e.target.value })} /></div>
          </div>
        </div>

        {!selected.completedAt && (
          <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
            DO NOT SELECT UNTIL ALL THE FORM HAS BEEN COMPLETED. SELECTING THIS WILL LOCK THE FORM.
          </div>
        )}
        <div className="card">
          <div className="grid2">
            <div className="field">
              <label>Overall assessment</label>
              <select disabled={!!selected.completedAt} value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
                <option value="">—</option>
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div className="field">
              <label>Overall score (1–5)</label>
              <input type="number" min="1" max="5" disabled={!!selected.completedAt} defaultValue={selected.score || ''} onBlur={(e) => api.patch(`/api/checks/${selected.id}`, { score: Number(e.target.value) || null }).then(load)} />
            </div>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? 'Archived emergency procedures checks' : '12-month cycle, separate from IPC and Proficiency Check'}</div>
        {!archived && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Add emergency procedures check'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="grid2">
            {crewMemberId
              ? <div className="field"><label>Candidate</label><input value={newForm.name} disabled /></div>
              : <div className="field"><label>Candidate name</label><input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} required /></div>}
            <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          </div>
          <AssignedToPicker
            value={newForm.assignedTo}
            accessType="EMERGENCY_PROCEDURES"
            fleet={fleet}
            onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '', assessorId: s?.id || f.assessorId, assessor: s?.name || f.assessor, assessorArn: s?.arn || f.assessorArn }))}
          />
          <div className="grid2">
            <AssessorPicker value={newForm.assessorId} accessType="EMERGENCY_PROCEDURES" fleet={fleet} onSelect={(s) => setAssessor(s, (patch) => setNewForm((f) => ({ ...f, ...patch })))} />
            <div className="field">
              <label>Aircraft type</label>
              <select value={newForm.actype} onChange={(e) => setNewForm({ ...newForm, actype: e.target.value })}>
                <option value="">—</option>
                {AIRCRAFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Check type (select all that apply)</label></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '0.875rem' }}>
            {EP_TYPES.map((t) => (
              <div
                key={t}
                onClick={() => toggleType(t)}
                style={{
                  padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  background: newForm.types.includes(t) ? 'var(--bg-accent)' : 'var(--surface-2)',
                  color: newForm.types.includes(t) ? 'var(--text-accent)' : 'inherit',
                }}
              >{t}</div>
            ))}
          </div>
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {archived ? 'archived ' : ''}emergency procedures checks yet.</div>}
      {checks.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.details?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(c.details?.types || []).join(', ') || 'No type selected'} · {c.details?.date || 'No date'}</div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
