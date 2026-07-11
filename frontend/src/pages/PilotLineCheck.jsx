import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AssessorPicker } from '../components/AssessorPicker';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { PrintButton } from '../components/PrintButton';
import { openPrintWindow, section, signatureBlock, resultBadge, seatCheckBox } from '../lib/print';
import { formatDate, formatUserRole } from '../lib/format';
import { competencyStatus } from '../lib/dueStatus';

// Recurring pilot Line Check (SA_490 - 365 days from the initial Check to
// Line date, then every 365 days after - see backend/src/lib/currency.js).
// One generic item catalogue for every pilot fleet (see check-form-items.js
// FORM_KEYS/PILOT_LINE_CHECK, editable from Syllabus > Check Forms), keyed
// by item.id rather than a fixed source-code list. Only ever rendered
// scoped to one Crew roster member (see CrewDetail.jsx) - there's no
// free-text/ad-hoc use of this check type.
const REFRESHER_ITEM_NAME = 'Refresher training and check';
const AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];
// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new check
// record - mirrors backend/src/routes/checks.js POST /.
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
// SA_490 only lists LHS/RHS (unlike ProficiencyChecks' three-seat check).
const SEAT_OPTIONS = ['LHS', 'RHS'];

const emptyDetails = () => ({
  date: '', assessorId: '', assessor: '', assessorArn: '', actype: '', comments: '',
  assessorSig: '', candidateSig: '', results: {}, seatCheck: [],
});
const emptyNewForm = () => ({ ...emptyDetails(), assignedTo: '' });

// The Terminal section lists every named approach type (ILS/RNAV/VOR/NDB/
// LLZ/DME or GNSS Arrival - see migration 0067) so the assessor can pick
// whichever one was actually flown - only one approach is flown per check,
// so unlike every other section here, this one is satisfied by a single
// item ticked ✓ rather than requiring every item individually answered.
const TERMINAL_SECTION = 'Terminal';

function groupBySection(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.section || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()];
}

// "Refresher training and check" isn't ticked by hand on this form - it
// reflects whether the crew member's own Refresher Training competency
// (see crew.js /:id/competencies) is currently held, so it can never fall
// out of sync with the date actually on file for them.
function RefresherTrainingRow({ refresherCompetency }) {
  const isCurrent = !!refresherCompetency
    && !refresherCompetency.na
    && !!refresherCompetency.dueDate
    && competencyStatus(refresherCompetency.dueDate) !== 'overdue';

  return (
    <div className="row" style={{ cursor: 'default' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13 }}>{REFRESHER_ITEM_NAME}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {refresherCompetency?.dueDate
            ? `Refresher Training competency due ${formatDate(refresherCompetency.dueDate)}`
            : 'No Refresher Training date on file for this crew member'}
        </div>
      </div>
      <span className={`badge ${isCurrent ? 'pass' : 'fail'}`}>{isCurrent ? '✓ Current' : 'Not current'}</span>
    </div>
  );
}

function isItemAnswered(item, value) {
  return value !== undefined;
}

function ItemRow({ item, value, disabled, onChange }) {
  if (item.kind === 'text') {
    return (
      <div className="field" style={{ margin: '0 0 10px' }}>
        <label>{item.description}</label>
        <input defaultValue={value || ''} disabled={disabled} onBlur={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  if (item.kind === 'score') {
    return (
      <div className="row" style={{ cursor: 'default' }}>
        <div style={{ flex: 1, fontSize: 13 }}>{item.description}</div>
        <input
          type="number" min="1" max="5" style={{ width: 60 }}
          disabled={disabled} defaultValue={value ?? ''}
          onBlur={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        />
      </div>
    );
  }

  // Plain tick.
  return (
    <div className="row" style={{ cursor: 'default' }}>
      <div style={{ flex: 1, fontSize: 13 }}>{item.description}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" className={`tick-btn ${value === true ? 'active-pass' : ''}`} disabled={disabled} onClick={() => onChange(true)}>✓</button>
        <button type="button" className={`tick-btn ${value === false ? 'active-fail' : ''}`} disabled={disabled} onClick={() => onChange(false)}>✗</button>
      </div>
    </div>
  );
}

export function PilotLineCheck({ crewMemberId, crewMemberName, archived = false, fleet, crewArchived = false }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(emptyNewForm());
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [refresherCompetency, setRefresherCompetency] = useState(null);

  useEffect(() => {
    // fleet can be undefined for a pilot ticked on more than one fleet
    // (see CrewDetail.jsx) - falls back to the unfiltered list, which just
    // means they'd also see the Dash 8/Metro 23-only "Narrow runway
    // supplement" item even if only one of their fleets needs it.
    const fleetParam = fleet ? `&fleet=${fleet}` : '';
    api.get(`/api/check-form-items?formKey=PILOT_LINE_CHECK${fleetParam}`).then(setItems).catch(() => {});
  }, [fleet]);
  useEffect(() => {
    api.get(`/api/crew/${crewMemberId}/competencies`)
      .then((rows) => setRefresherCompetency(rows.find((r) => r.name === 'Refresher Training') || null))
      .catch(() => {});
  }, [crewMemberId]);
  useEffect(() => {
    // Carries over an examiner/instructor/check pilot already assigned to
    // this crew member's upcoming Line Check from the Planning page.
    api.get(`/api/crew/${crewMemberId}`)
      .then((m) => setNewForm((f) => {
        const planned = m.currency?.lineCheck?.plannedAssignedTo;
        return planned && !f.assignedTo
          ? { ...f, assignedTo: planned.id, assessorId: planned.id, assessor: planned.name, assessorArn: planned.arn }
          : f;
      }))
      .catch(() => {});
  }, [crewMemberId]);

  function load() {
    api.get(`/api/checks?checkType=PILOT_LINE_CHECK&archived=${archived}&crewMemberId=${crewMemberId}`)
      .then(setChecks)
      .catch((e) => setError(e.message));
  }
  useEffect(load, [archived, crewMemberId]);

  const selected = checks.find((c) => c.id === selectedId);
  const tickableItems = items.filter((i) => i.description !== REFRESHER_ITEM_NAME);
  const sections = groupBySection(tickableItems);

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

  function setItemResult(check, itemId, value) {
    patchDetails(check, { results: { ...(check.details?.results || {}), [itemId]: value } });
  }

  function toggleSeat(check, currentSeats, seat) {
    const next = currentSeats.includes(seat) ? currentSeats.filter((s) => s !== seat) : [...currentSeats, seat];
    patchDetails(check, { seatCheck: next });
  }

  async function setResult(check, result) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { result, completedAt: new Date().toISOString() });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function setScore(check, score) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { score });
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

  async function deleteCheck(check) {
    setError(null);
    try { await api.delete(`/api/checks/${check.id}`); setSelectedId(null); load(); }
    catch (err) { setError(err.message); }
  }

  function printCheck(check) {
    const d = check.details || {};
    const results = d.results || {};
    const seatCheck = Array.isArray(d.seatCheck) ? d.seatCheck : [];
    const isCurrent = !!refresherCompetency && !refresherCompetency.na && !!refresherCompetency.dueDate && competencyStatus(refresherCompetency.dueDate) !== 'overdue';
    let body = `
      <h1>Line Check</h1>
      <div class="meta">${crewMemberName} · ${d.actype || 'No aircraft type'} · ${d.date || ''}</div>
      ${section('General', [[REFRESHER_ITEM_NAME, isCurrent ? '✓ Current' : 'Not current']])}
    `;
    for (const [sectionName, sectionItems] of sections) {
      body += section(sectionName, sectionItems.map((item) => {
        const v = results[item.id];
        if (item.kind === 'text') return [item.description, v || ''];
        if (item.kind === 'score') return [item.description, v !== undefined ? String(v) : ''];
        return [item.description, v === true ? '✓' : v === false ? '✗' : ''];
      }));
    }
    body += seatCheckBox(seatCheck, SEAT_OPTIONS, 'Check Conducted In', null);
    body += section('Details', [
      ['Assessor', d.assessor],
      ['Assessor ARN', d.assessorArn],
      ['Comments', d.comments],
      ['Overall assessment', resultBadge(check.result)],
      ['Overall score', check.score],
    ]);
    body += signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]]);
    openPrintWindow(`Line Check - ${crewMemberName}`, body);
  }

  if (selected) {
    const d = selected.details || {};
    const results = d.results || {};
    const seatCheck = Array.isArray(d.seatCheck) ? d.seatCheck : [];
    const locked = !!selected.completedAt;
    const nonTerminalItems = tickableItems.filter((i) => i.section !== TERMINAL_SECTION);
    const terminalItems = tickableItems.filter((i) => i.section === TERMINAL_SECTION);
    const terminalAnswered = terminalItems.length === 0 || terminalItems.some((item) => results[item.id] === true);
    const allItemsAnswered = tickableItems.length > 0
      && nonTerminalItems.every((item) => isItemAnswered(item, results[item.id]))
      && terminalAnswered;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={() => setSelectedId(null)}>← Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {(selected.archived || selected.completedAt) && <PrintButton onPrint={() => printCheck(selected)} />}
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
          <div style={{ fontSize: 16, fontWeight: 500 }}>{crewMemberName} — Line Check</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.actype || 'No aircraft type'} · {d.date ? formatDate(d.date) : 'No date'}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `${selected.assignedToRole ? formatUserRole(selected.assignedToRole) : 'Assigned to'} ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <AssignedToPicker value={selected.assignedTo} accessType="LINE_CHECK" fleet={fleet} onAssign={(s) => reassign(selected, s)} />
        </div>

        <div className="card">
          <div className="grid2">
            <AssessorPicker value={d.assessorId} accessType="LINE_CHECK" fleet={fleet} disabled={locked} onSelect={(s) => setAssessor(s, (patch) => patchDetails(selected, patch))} />
            <div className="field"><label>Assessor ARN</label><input value={d.assessorArn || ''} disabled /></div>
          </div>
          <div className="field">
            <label>Aircraft type</label>
            <select value={d.actype || ''} disabled={locked} onChange={(e) => patchDetails(selected, { actype: e.target.value })}>
              <option value="">—</option>
              {AIRCRAFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          <RefresherTrainingRow refresherCompetency={refresherCompetency} />
        </div>

        {sections.map(([sectionName, sectionItems]) => (
          <div key={sectionName} className="card">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>{sectionName}</div>
            {sectionName === TERMINAL_SECTION && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Tick ✓ the one approach actually flown - the rest can be left blank.
              </div>
            )}
            {sectionItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                value={results[item.id]}
                disabled={locked}
                onChange={(v) => setItemResult(selected, item.id, v)}
              />
            ))}
          </div>
        ))}

        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>Check Conducted In</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {SEAT_OPTIONS.map((seat) => (
              <button
                key={seat}
                type="button"
                disabled={locked}
                className={seatCheck.includes(seat) ? 'primary' : ''}
                onClick={() => toggleSeat(selected, seatCheck, seat)}
              >{seat}</button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="field"><label>Comments</label><textarea defaultValue={d.comments} disabled={locked} onBlur={(e) => patchDetails(selected, { comments: e.target.value })} style={{ minHeight: 60 }} /></div>
          <div className="grid2">
            {selected.assignedTo ? (
              <PinSignature
                label="Assessor signature" personType="user" personId={selected.assignedTo}
                signedName={d.assessorSig} signedAt={d.assessorSigAt} disabled={locked}
                onSigned={(name, at) => patchDetails(selected, { assessorSig: name, assessorSigAt: at })}
              />
            ) : (
              <div className="field"><label>Assessor signature</label><input defaultValue={d.assessorSig} disabled={locked} onBlur={(e) => patchDetails(selected, { assessorSig: e.target.value })} /></div>
            )}
            <PinSignature
              label="Candidate signature" personType="crewMember" personId={crewMemberId}
              signedName={d.candidateSig} signedAt={d.candidateSigAt} disabled={locked}
              onSigned={(name, at) => patchDetails(selected, { candidateSig: name, candidateSigAt: at })}
            />
          </div>
        </div>

        {!locked && (
          <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
            DO NOT SELECT UNTIL ALL THE FORM HAS BEEN COMPLETED. SELECTING THIS WILL LOCK THE FORM.
          </div>
        )}
        {!locked && !allItemsAnswered && (
          <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Every item above must be ticked before the overall assessment can be set.
          </div>
        )}
        <div className="card">
          <div className="grid2">
            <div className="field">
              <label>Overall assessment</label>
              <select disabled={locked || !allItemsAnswered} value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
                <option value="">—</option>
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div className="field">
              <label>Overall score (1–5)</label>
              <input type="number" min="1" max="5" disabled={locked} defaultValue={selected.score || ''} onBlur={(e) => setScore(selected, Number(e.target.value) || null)} />
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
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? 'Archived Line Checks' : 'Line Check — due 365 days from the initial Check to Line date, then every 365 days after'}</div>
        {!archived && !crewArchived && isAdmin && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Log Line Check'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="grid2">
            <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} required /></div>
            <div className="field">
              <label>Aircraft type</label>
              <select value={newForm.actype} onChange={(e) => setNewForm({ ...newForm, actype: e.target.value })}>
                <option value="">—</option>
                {AIRCRAFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
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
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {c.details?.actype || 'No aircraft type'} · {c.details?.assessor ? `Assessor: ${c.details.assessor}` : 'No assessor'}
            </div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
