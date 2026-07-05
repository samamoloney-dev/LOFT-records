import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { RECURRENT_TRAINING_ITEMS, KNOWLEDGE_ITEMS, FLIGHT_COMPONENT_SECTIONS } from './proficiency-check-items';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock, resultBadge } from '../lib/print';
import { formatUserRole } from '../lib/format';

const VARIANT_LABELS = { PC: 'Proficiency Check', IPC_PC: 'IPC and Proficiency Check' };
const AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];
const SEAT_OPTIONS = ['LHS', 'RHS', 'Other Seat'];

// IPC and Proficiency Check draw from different check-access ticks even
// though they're the same underlying record type.
function variantAccessType(variant) {
  return variant === 'IPC_PC' ? 'IPC' : 'PC';
}

const emptyForm = (variant) => ({ name: '', date: '', assessor: '', actype: '', arn: '', variant, assignedTo: '', examinerName: '', examinerArn: '' });

const emptyDetails = (variant) => ({
  variant,
  results: {},
  seatCheck: [],
  testNumber: '',
  applicantArn: '', applicantName: '', applicantSig: '',
  fstdNumber: '', fstdType: '', groundTime: '', simulatorTime: '',
  examinerArn: '', examinerName: '', examinerSig: '',
  examinerComments: '',
});

function ItemRow({ id, description, mos, result, disabled, onSetResult }) {
  return (
    <div className="row" style={{ cursor: 'default' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13 }}>{description}</div>
        {mos && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>MOS {mos}</div>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {['S', 'X', 'N'].map((v) => (
          <button
            key={v}
            disabled={disabled}
            className={`tick-btn ${result === v ? (v === 'X' ? 'active-fail' : 'active-pass') : ''}`}
            onClick={() => onSetResult(id, result === v ? undefined : v)}
          >{v === 'S' ? '✓' : v === 'X' ? '✗' : 'N/A'}</button>
        ))}
      </div>
    </div>
  );
}

// variant is fixed per tab ('PC' or 'IPC_PC') - the IPC and PC subtabs each
// render this with their own variant rather than letting the user pick one.
// crewMemberId/crewMemberName scope this to one Crew roster member's own
// IPC/PC history (see CrewDetail.jsx) instead of the free-text list used for
// ad-hoc/initial-training checks.
export function ProficiencyChecks({ variant, label, archived = false, crewMemberId, crewMemberName, fleet }) {
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(() => ({ ...emptyForm(variant), name: crewMemberName || '' }));
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/checks?checkType=RECURRENT_SIMULATOR&archived=${archived}${crewMemberId ? `&crewMemberId=${crewMemberId}` : ''}`)
      .then((all) => setChecks(all.filter((c) => c.details?.variant === variant)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [variant, archived, crewMemberId]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    if (!newForm.name.trim()) return;
    try {
      const details = {
        ...emptyDetails(variant),
        name: newForm.name, date: newForm.date, assessor: newForm.assessor, actype: newForm.actype, arn: newForm.arn,
        examinerName: newForm.examinerName, examinerArn: newForm.examinerArn,
        // Carry the candidate's name/ARN (already given when the check was
        // assigned) straight into the Applicant section below, instead of
        // asking for the same information twice.
        applicantName: newForm.name, applicantArn: newForm.arn,
      };
      await api.post('/api/checks', { checkType: 'RECURRENT_SIMULATOR', appliesTo: 'PILOT', assignedTo: newForm.assignedTo || undefined, crewMemberId, details });
      setCreating(false);
      setNewForm({ ...emptyForm(variant), name: crewMemberName || '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function reassign(check, staffMember) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, {
        assignedTo: staffMember?.id || null,
        details: {
          ...check.details,
          assessor: staffMember?.name || check.details?.assessor,
          examinerName: staffMember?.name || check.details?.examinerName,
          examinerArn: staffMember?.arn || check.details?.examinerArn,
        },
      });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
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

  function toggleSeat(check, currentSeats, seat) {
    const next = currentSeats.includes(seat) ? currentSeats.filter((s) => s !== seat) : [...currentSeats, seat];
    patchDetails(check, { seatCheck: next });
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

  function resultMark(v) {
    return v === 'S' ? '✓' : v === 'X' ? '✗' : v === 'N' ? 'N/A' : '';
  }

  // IPC and PC print as two pages: page 1 is the training/knowledge/flight
  // assessment, page 2 is applicant/FSTD/examiner admin details and result.
  function printCheck(check) {
    const d = check.details || {};
    const isIpc = d.variant === 'IPC_PC';
    const results = d.results || {};
    const seatCheck = Array.isArray(d.seatCheck) ? d.seatCheck : (d.seatCheck ? [d.seatCheck] : []);
    const flightSections = FLIGHT_COMPONENT_SECTIONS.map((s) => ({
      ...s,
      allItems: isIpc && s.ipcOnlyItems ? [...s.ipcOnlyItems, ...s.items] : s.items,
    }));

    const recurrentRows = RECURRENT_TRAINING_ITEMS.map((item, i) => [item.description, resultMark(results[`rt-${i}`])]);
    const knowledgeRows = isIpc ? KNOWLEDGE_ITEMS.map((item, i) => [item.description, resultMark(results[`kn-${i}`])]) : [];
    // Wrapped in compact-section so the 2-column layout below never splits
    // a table across the column break, and columns-2 so the long checklist
    // (up to ~56 rows for IPC) uses the page's full width instead of just
    // running down a single narrow column for several pages.
    const recurrentHtml = `<div class="compact-section">${section('Recurrent Training (121.50 (1B))', recurrentRows)}</div>`;
    const knowledgeHtml = isIpc ? `<div class="compact-section">${section('Knowledge requirements (Ground Component)', knowledgeRows)}</div>` : '';
    const flightHtml = flightSections
      .map((s) => `<div class="compact-section">${section(`${s.section} (Flight Component)`, s.allItems.map((item, i) => [item.description, resultMark(results[`fc-${s.section}-${i}`])]))}</div>`)
      .join('');

    // Only page 1 (the long checklists) needs the compact/2-column
    // treatment to fit its page count - page 2 is four short sections and
    // renders fine at normal spacing. Applying compact spacing there too
    // previously crowded rows badly enough that values visually shifted
    // onto the wrong labels.
    const html = `
      <div class="compact">
        <h1>${VARIANT_LABELS[d.variant] || 'Proficiency Check'}</h1>
        <div class="meta">${d.name || ''} · ${d.actype || 'No aircraft type'} · ${d.date || ''} · Assessor: ${d.assessor || '—'}</div>
        ${section('Assignment', [
          ['Assigned to', check.assignedToName ? `${check.assignedToName}${check.assignedToArn ? ` (ARN ${check.assignedToArn})` : ''}` : 'Unassigned'],
        ])}
        <div class="columns-2">
          ${recurrentHtml}
          ${knowledgeHtml}
          ${flightHtml}
        </div>
        ${section('Seat check conducted in', [['Seats', seatCheck.join(', ') || '—']])}
      </div>

      <div class="page-break"></div>
      <h1>${VARIANT_LABELS[d.variant] || 'Proficiency Check'} (continued)</h1>
      ${section('Applicant', [
        ['Test number', d.testNumber],
        ['Applicant ARN', d.applicantArn],
        ['Applicant name', d.applicantName],
      ])}
      ${section('FSTD', [
        ['FSTD number', d.fstdNumber],
        ['FSTD type', d.fstdType],
        ['Ground time', d.groundTime],
        ['Simulator time', d.simulatorTime],
      ])}
      ${section('Examiner', [
        ['Examiner ARN', d.examinerArn],
        ['Examiner name', d.examinerName],
        ["Examiner's comments", d.examinerComments],
      ])}
      ${section('Result', [['Overall assessment', resultBadge(check.result)]])}
      ${signatureBlock([['Applicant signature', d.applicantSig], ['Examiner signature', d.examinerSig]])}
    `;
    openPrintWindow(`${VARIANT_LABELS[d.variant] || 'Proficiency Check'} - ${d.name || ''}`, html);
  }

  if (selected) {
    const d = selected.details || {};
    const isIpc = d.variant === 'IPC_PC';
    const results = d.results || {};
    // seatCheck used to be a single string - normalize old records to an array.
    const seatCheck = Array.isArray(d.seatCheck) ? d.seatCheck : (d.seatCheck ? [d.seatCheck] : []);

    function setItemResult(id, value) {
      patchDetails(selected, { results: { ...results, [id]: value } });
    }

    const flightSections = FLIGHT_COMPONENT_SECTIONS.map((s) => ({
      ...s,
      allItems: isIpc && s.ipcOnlyItems ? [...s.ipcOnlyItems, ...s.items] : s.items,
    }));

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
          <div style={{ fontSize: 16, fontWeight: 500 }}>{d.name} — {VARIANT_LABELS[d.variant]}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.actype || 'No aircraft type'} · {d.date || 'No date'} · Assessor: {d.assessor || '—'}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `${selected.assignedToRole ? formatUserRole(selected.assignedToRole) : 'Assigned to'} ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType={variantAccessType(d.variant)} fleet={fleet} onAssign={(s) => reassign(selected, s)} />
        </div>

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Recurrent Training (121.50 (1B))</div>
          {RECURRENT_TRAINING_ITEMS.map((item, i) => (
            <ItemRow key={i} id={`rt-${i}`} description={item.description} mos={item.mos} result={results[`rt-${i}`]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
          ))}
        </div>

        {isIpc && (
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Knowledge requirements (Ground Component)</div>
            {KNOWLEDGE_ITEMS.map((item, i) => (
              <ItemRow key={i} id={`kn-${i}`} description={item.description} mos={item.mos} result={results[`kn-${i}`]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
            ))}
          </div>
        )}

        {flightSections.map((s) => (
          <div key={s.section} className="card">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>{s.section} (Flight Component)</div>
            {s.allItems.map((item, i) => (
              <ItemRow key={i} id={`fc-${s.section}-${i}`} description={item.description} mos={item.mos} result={results[`fc-${s.section}-${i}`]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
            ))}
          </div>
        ))}

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Seat check conducted in</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Training captains in LHS and Other, F.O. in RHS, Captains in LHS (select all that apply)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {SEAT_OPTIONS.map((seat) => (
              <button
                key={seat}
                disabled={!!selected.completedAt}
                className={seatCheck.includes(seat) ? 'primary' : ''}
                onClick={() => toggleSeat(selected, seatCheck, seat)}
              >{seat}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="field"><label>Test number</label><input defaultValue={d.testNumber} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { testNumber: e.target.value })} /></div>
          <div className="grid2">
            <div className="field"><label>Applicant ARN</label><input defaultValue={d.applicantArn} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { applicantArn: e.target.value })} /></div>
            <div className="field"><label>Applicant name</label><input defaultValue={d.applicantName} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { applicantName: e.target.value })} /></div>
          </div>
          <div className="field"><label>Applicant signature</label><input defaultValue={d.applicantSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { applicantSig: e.target.value })} /></div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>FSTD</div>
          <div className="grid2">
            <div className="field"><label>FSTD number</label><input defaultValue={d.fstdNumber} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { fstdNumber: e.target.value })} /></div>
            <div className="field"><label>FSTD type</label><input defaultValue={d.fstdType} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { fstdType: e.target.value })} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Ground time</label><input defaultValue={d.groundTime} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { groundTime: e.target.value })} /></div>
            <div className="field"><label>Simulator time</label><input defaultValue={d.simulatorTime} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { simulatorTime: e.target.value })} /></div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Examiner</div>
          <div className="grid2">
            <div className="field"><label>Examiner ARN</label><input defaultValue={d.examinerArn} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerArn: e.target.value })} /></div>
            <div className="field"><label>Examiner name</label><input defaultValue={d.examinerName} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerName: e.target.value })} /></div>
          </div>
          <div className="field"><label>Examiner signature</label><input defaultValue={d.examinerSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerSig: e.target.value })} /></div>
          <div className="field"><label>Examiner's comments</label><textarea defaultValue={d.examinerComments} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerComments: e.target.value })} style={{ minHeight: 70 }} /></div>
        </div>

        {!selected.completedAt && (
          <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
            DO NOT SELECT UNTIL ALL THE FORM HAS BEEN COMPLETED. SELECTING THIS WILL LOCK THE FORM.
          </div>
        )}
        <div className="card">
          <div className="field">
            <label>Overall assessment</label>
            <select disabled={!!selected.completedAt} value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
              <option value="">—</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? `Archived ${label.toLowerCase()} records` : label}</div>
        {!archived && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Add check'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="grid2">
            {crewMemberId
              ? <div className="field"><label>Candidate</label><input value={newForm.name} disabled /></div>
              : <div className="field"><label>Candidate name</label><input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} required /></div>}
            <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Assessor(s)</label><input value={newForm.assessor} onChange={(e) => setNewForm({ ...newForm, assessor: e.target.value })} /></div>
            <div className="field">
              <label>Aircraft type</label>
              <select value={newForm.actype} onChange={(e) => setNewForm({ ...newForm, actype: e.target.value })}>
                <option value="">—</option>
                {AIRCRAFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Applicant's ARN</label><input value={newForm.arn} onChange={(e) => setNewForm({ ...newForm, arn: e.target.value })} /></div>
          <AssignedToPicker
            value={newForm.assignedTo}
            accessType={variantAccessType(variant)}
            fleet={fleet}
            onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '', assessor: s?.name || f.assessor, examinerName: s?.name || f.examinerName, examinerArn: s?.arn || f.examinerArn }))}
          />
          <button type="submit" className="primary">Create check record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {archived ? 'archived ' : ''}{label.toLowerCase()} records yet.</div>}
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
