import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { AssessorPicker } from '../components/AssessorPicker';
import { ArchiveButton } from '../components/ArchiveButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock, resultBadge } from '../lib/print';

const CA_CHECK_ITEMS = [
  'Personal Presentation',
  'On Time Performance',
  'Pre Flight Duties and Pre Flight Checks',
  'Pre Embarkation and Passenger Boarding',
  'Passenger Briefings and Passenger Announcements',
  'In-Flight Service',
  'Management and Communication',
  'Post Flight Duties',
  'General Knowledge of Skippers Regulations',
  'Knowledge of how to manage Restricted, Unruly and Passengers with reduced mobility',
];
const CA_NTS_MARKERS = ['Communication and Teamwork', 'Leadership and Workload Management', 'Situational Awareness', 'Decision Making Process'];
const AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];

const emptyDetails = () => ({ name: '', date: '', assessorId: '', assessor: '', assessorArn: '', actype: '', items: {}, serviceMode: null, nts: {}, comments: '', assessorSig: '', candidateSig: '' });
const emptyNewForm = () => ({ ...emptyDetails(), assignedTo: '' });

// crewMemberId/crewMemberName scope this to one Crew roster member's own
// recurring Line Checks (see CrewDetail.jsx) instead of the free-text list
// used for ad-hoc/initial-training checks.
export function CaChecks({ archived = false, crewMemberId, crewMemberName }) {
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(() => ({ ...emptyNewForm(), name: crewMemberName || '' }));
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/checks?checkType=CABIN_ATTENDANT_LINE_CHECK&archived=${archived}${crewMemberId ? `&crewMemberId=${crewMemberId}` : ''}`).then(setChecks).catch((e) => setError(e.message));
  }
  useEffect(load, [archived, crewMemberId]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    if (!newForm.name.trim()) return;
    try {
      const { assignedTo, ...details } = newForm;
      await api.post('/api/checks', { checkType: 'CABIN_ATTENDANT_LINE_CHECK', appliesTo: 'CABIN_ATTENDANT', assignedTo: assignedTo || undefined, crewMemberId, details });
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

  function printCheck(check) {
    const d = check.details || {};
    const itemRows = CA_CHECK_ITEMS.map((item, i) => [item, d.items?.[i] === 'S' ? '✓' : d.items?.[i] === 'X' ? '✗' : d.items?.[i] === 'N' ? 'N/A' : '']);
    const ntsRows = CA_NTS_MARKERS.map((m, i) => [m, `Score ${d.nts?.[`score${i}`] || '—'} · Code ${d.nts?.[`code${i}`] || '—'}`]);
    const html = `
      <h1>Cabin Attendant Line Check (SA 540)</h1>
      <div class="meta">${d.name || ''} · ${d.actype || 'No aircraft type'} · ${d.date || ''}</div>
      ${section('Details', [
        ['Assessor', d.assessor],
        ['Assessor ARN', d.assessorArn],
        ['Assigned to', check.assignedToName ? `${check.assignedToName}${check.assignedToArn ? ` (ARN ${check.assignedToArn})` : ''}` : 'Unassigned'],
        ['In-flight service', d.serviceMode === 'demo' ? 'Demonstrated' : d.serviceMode === 'desc' ? 'Described' : ''],
      ])}
      ${section('Assessment', itemRows)}
      ${section('Non Technical Skill Assessment', ntsRows)}
      ${section('Result', [
        ['Comments', d.comments],
        ['Overall assessment', resultBadge(check.result)],
        ['Overall score', check.score],
      ])}
      ${signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]])}
    `;
    openPrintWindow(`CA Line Check - ${d.name || ''}`, html);
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
          <div style={{ fontSize: 16, fontWeight: 500 }}>{d.name} — Cabin Attendant Line Check</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.actype || 'No aircraft type'} · {d.date || 'No date'}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `Assigned to ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType="LINE_CHECK" onAssign={(s) => reassign(selected, s)} />
        </div>

        <div className="card">
          <div className="section-tag" style={{ fontWeight: 500, marginBottom: 8 }}>ASSESSMENT</div>
          {CA_CHECK_ITEMS.map((item, i) => (
            <div key={i} className="row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 13 }}>{item}</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['S', 'X', 'N'].map((v) => (
                    <button
                      key={v}
                      className={`tick-btn ${d.items?.[i] === v ? (v === 'X' ? 'active-fail' : 'active-pass') : ''}`}
                      onClick={() => patchDetails(selected, { items: { ...d.items, [i]: d.items?.[i] === v ? undefined : v } })}
                    >{v === 'S' ? '✓' : v === 'X' ? '✗' : 'N/A'}</button>
                  ))}
                </div>
              </div>
              {item === 'In-Flight Service' && (
                <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12 }}>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" checked={d.serviceMode === 'demo'} onChange={() => patchDetails(selected, { serviceMode: 'demo' })} /> Demonstrated
                  </label>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" checked={d.serviceMode === 'desc'} onChange={() => patchDetails(selected, { serviceMode: 'desc' })} /> Described
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 8 }}>NON TECHNICAL SKILL ASSESSMENT</div>
          <div className="grid2">
            {CA_NTS_MARKERS.map((m, i) => (
              <div key={i} style={{ padding: '6px 0' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{m}</div>
                <div className="grid2" style={{ gap: 6 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Score</label>
                    <input defaultValue={d.nts?.[`score${i}`] || ''} onBlur={(e) => patchDetails(selected, { nts: { ...d.nts, [`score${i}`]: e.target.value } })} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Code</label>
                    <input defaultValue={d.nts?.[`code${i}`] || ''} onBlur={(e) => patchDetails(selected, { nts: { ...d.nts, [`code${i}`]: e.target.value } })} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="field">
            <label>Comments</label>
            <textarea defaultValue={d.comments} onBlur={(e) => patchDetails(selected, { comments: e.target.value })} style={{ minHeight: 70 }} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Overall assessment</label>
              <select value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
                <option value="">—</option>
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div className="field">
              <label>Overall score (1–5)</label>
              <input type="number" min="1" max="5" defaultValue={selected.score || ''} onBlur={(e) => api.patch(`/api/checks/${selected.id}`, { score: Number(e.target.value) || null }).then(load)} />
            </div>
          </div>
          <div className="grid2">
            <AssessorPicker value={d.assessorId} accessType="LINE_CHECK" onSelect={(s) => setAssessor(s, (patch) => patchDetails(selected, patch))} />
            <div className="field"><label>Assessor ARN</label><input value={d.assessorArn || ''} disabled /></div>
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
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? 'Archived cabin attendant line checks' : 'Cabin Attendant Line Check (SA 540) — 12-month cycle, initial and recurrent'}</div>
        {!archived && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Add cabin attendant check'}</button>}
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
            accessType="LINE_CHECK"
            onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '', assessorId: s?.id || f.assessorId, assessor: s?.name || f.assessor, assessorArn: s?.arn || f.assessorArn }))}
          />
          <div className="grid2">
            <AssessorPicker value={newForm.assessorId} accessType="LINE_CHECK" onSelect={(s) => setAssessor(s, (patch) => setNewForm((f) => ({ ...f, ...patch })))} />
            <div className="field">
              <label>Aircraft type</label>
              <select value={newForm.actype} onChange={(e) => setNewForm({ ...newForm, actype: e.target.value })}>
                <option value="">—</option>
                {AIRCRAFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {archived ? 'archived ' : ''}cabin attendant checks yet.</div>}
      {checks.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.details?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.details?.actype || 'No aircraft type'} · {c.details?.date || 'No date'}</div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
