import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { AssignedToPicker } from '../components/AssignedToPicker';
import { CrewMemberPicker } from '../components/CrewMemberPicker';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { PrintButton } from '../components/PrintButton';
import {
  openPrintWindow, section, signatureBlock, resultBadge,
  formTitleRow, fieldGrid, checklistTable, seatCheckBox, labeledRowGroup,
} from '../lib/print';
import { formatUserRole, formatFleet } from '../lib/format';
import { SURVEY_FILL_ROLES } from '../lib/roles';
import { compressImage } from '../lib/imageCompress';

const VARIANT_LABELS = { PC: 'Proficiency Check', IPC_PC: 'IPC and Proficiency Check' };
const AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];
const RANK_OPTIONS = [{ value: 'CAPTAIN', label: 'Captain' }, { value: 'FIRST_OFFICER', label: 'First Officer' }];
const SEAT_OPTIONS = ['LHS', 'RHS', 'Other Seat'];
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// The Recurrent Training and Knowledge sections are their own fixed
// blocks (see check-form-items.js seed data); everything else in the
// PROFICIENCY_CHECK item catalog is a Flight Component section, grouped
// by its section name in item order (which is already IPC-only items
// before regular items within a section, where that applies).
const RECURRENT_SECTION = 'Recurrent Training (121.50 (1B))';
const KNOWLEDGE_SECTION = 'Knowledge requirements (Ground Component)';

function groupFlightSections(items) {
  const bySection = new Map();
  for (const item of items) {
    if (item.section === RECURRENT_SECTION || item.section === KNOWLEDGE_SECTION) continue;
    if (!bySection.has(item.section)) bySection.set(item.section, []);
    bySection.get(item.section).push(item);
  }
  return [...bySection.entries()].map(([sectionName, sectionItems]) => ({ section: sectionName, items: sectionItems }));
}

// Continuous Improvement: once this check is completed, whoever conducted
// it rates the candidate 1-5 on a HOTC/HOFO-managed question bank, so
// trends in weak areas can be tracked over time (see
// frontend/src/pages/ContinuousImprovement.jsx). Not shown to the
// candidate - this only ever renders inside the staff-facing check detail.
function CandidateSurvey({ checkId }) {
  const { user } = useAuth();
  const canFill = SURVEY_FILL_ROLES.includes(user.role);
  const [questions, setQuestions] = useState([]);
  const [survey, setSurvey] = useState(null);
  const [scores, setScores] = useState({});
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/survey/questions').then(setQuestions).catch(() => {});
    api.get(`/api/survey/check/${checkId}`)
      .then((d) => { setSurvey(d.survey); setScores(d.survey?.responses || {}); })
      .catch((e) => setError(e.message));
  }
  useEffect(load, [checkId]);

  const locked = !canFill || !!survey?.submittedAt;

  async function setScore(questionId, score) {
    const nextScores = { ...scores, [questionId]: score };
    setScores(nextScores);
    setError(null);
    try {
      const updated = await api.put(`/api/survey/check/${checkId}`, {
        responses: Object.entries(nextScores).map(([qId, s]) => ({ questionId: qId, score: s })),
      });
      setSurvey(updated.survey);
    } catch (err) { setError(err.message); }
  }

  async function submit() {
    setError(null);
    try {
      const updated = await api.post(`/api/survey/check/${checkId}/submit`);
      setSurvey(updated.survey);
    } catch (err) { setError(err.message); }
  }

  if (questions.length === 0) return null;
  const allAnswered = questions.every((q) => scores[q.id] !== undefined);

  return (
    <div className="card">
      <div style={{ fontWeight: 500, marginBottom: 6 }}>Continuous Improvement Survey</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        For each performance criteria, pick the descriptor that best matches the candidate - feeds HOTC/HOFO trend analytics only, not shown to the candidate. Every question must be answered before the survey can be submitted.
      </div>
      {questions.map((q) => (
        <div key={q.id} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6 }}>{q.text}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(q.options || []).map((optionText, i) => {
              const score = i + 1;
              const selected = scores[q.id] === score;
              return (
                <div
                  key={score}
                  onClick={() => !locked && setScore(q.id, score)}
                  style={{
                    display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 8,
                    border: selected ? '1.5px solid var(--text-accent)' : '0.5px solid var(--border-strong)',
                    background: selected ? 'var(--bg-accent)' : 'var(--surface-1)',
                    cursor: locked ? 'default' : 'pointer',
                    opacity: locked && !selected ? 0.6 : 1,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, flexShrink: 0, color: selected ? 'var(--text-accent)' : 'var(--text-secondary)' }}>{score}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{optionText}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {survey?.submittedAt ? (
        <div className="badge pass" style={{ marginTop: 8 }}>Submitted</div>
      ) : (
        canFill && <button className="primary" style={{ marginTop: 8 }} onClick={submit} disabled={!allAnswered}>Submit survey</button>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

// IPC and Proficiency Check draw from different check-access ticks even
// though they're the same underlying record type.
function variantAccessType(variant) {
  return variant === 'IPC_PC' ? 'IPC' : 'PC';
}

const emptyForm = (variant) => ({ name: '', date: '', assessor: '', actype: '', arn: '', role: '', variant, assignedTo: '', linkedCrewMemberId: '', examinerName: '', examinerArn: '' });

const emptyDetails = (variant) => ({
  variant,
  results: {},
  seatCheck: [],
  testNumber: '',
  applicantArn: '', applicantName: '', applicantSig: '',
  fstdNumber: '', fstdType: '', groundTime: '', simulatorTime: '',
  examinerArn: '', examinerName: '', examinerSig: '',
  examinerComments: '',
  // actype/role snapshot the candidate's fleet and rank at the time of the
  // check - what Continuous Improvement analytics groups by (e.g. "Fokker
  // 100 Captain"), see backend/src/routes/survey.js analytics route.
  role: '',
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
export function ProficiencyChecks({ variant, label, archived = false, crewMemberId, crewMemberName, fleet, crewArchived = false }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(() => ({ ...emptyForm(variant), name: crewMemberName || '' }));
  const [error, setError] = useState(null);
  // Bumped whenever FSTD fields are autofilled, so the (uncontrolled)
  // number/type inputs below remount with the new defaultValue - otherwise
  // React ignores a defaultValue change on an already-mounted input.
  const [fstdVersion, setFstdVersion] = useState(0);
  // Fetched once so the create form can both offer a picker and auto-match
  // a hand-typed candidate name against an existing crew member.
  const [crewOptions, setCrewOptions] = useState([]);
  // Kept out of view by default when reopening an already-saved completed
  // check (it's a separate thing from the check form itself - the
  // bar-graph analytics on its own tab is how that data actually gets
  // used) - but setResult below flips this to true the moment a check is
  // completed, so the examiner/check captain can fill it in right away in
  // the same sitting rather than hunting for a button afterwards.
  const [showSurvey, setShowSurvey] = useState(false);
  // The item list is editable from the Syllabus tab (see
  // check-form-items.js) rather than fixed in source - results are keyed
  // by each item's id instead of its position in the list.
  const [pcItems, setPcItems] = useState([]);
  useEffect(() => {
    api.get('/api/check-form-items?formKey=PROFICIENCY_CHECK').then(setPcItems).catch(() => {});
  }, []);
  const recurrentItems = pcItems.filter((item) => item.section === RECURRENT_SECTION);
  const knowledgeItems = pcItems.filter((item) => item.section === KNOWLEDGE_SECTION);
  const flightSectionGroups = groupFlightSections(pcItems);

  function load() {
    api.get(`/api/checks?checkType=RECURRENT_SIMULATOR&archived=${archived}${crewMemberId ? `&crewMemberId=${crewMemberId}` : ''}`)
      .then((all) => setChecks(all.filter((c) => c.details?.variant === variant)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [variant, archived, crewMemberId]);
  useEffect(() => {
    if (crewMemberId) return;
    api.get('/api/crew?type=PILOT').then(setCrewOptions).catch(() => {});
  }, [crewMemberId]);
  useEffect(() => setShowSurvey(false), [selectedId]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    if (!newForm.name.trim()) return;
    try {
      // If nobody explicitly picked a crew member from the dropdown, fall
      // back to matching the typed candidate name - keeps currency/rank/
      // ARN flowing through even for admins who still just type the name.
      const nameMatch = !newForm.linkedCrewMemberId && crewOptions.find((m) => m.name.trim().toLowerCase() === newForm.name.trim().toLowerCase());
      const arn = newForm.arn || nameMatch?.arn || '';
      const role = newForm.role || nameMatch?.role || '';
      const details = {
        ...emptyDetails(variant),
        name: newForm.name, date: newForm.date, assessor: newForm.assessor, actype: newForm.actype, arn, role,
        examinerName: newForm.examinerName, examinerArn: newForm.examinerArn,
        // Carry the candidate's name/ARN (already given when the check was
        // assigned) straight into the Applicant section below, instead of
        // asking for the same information twice.
        applicantName: newForm.name, applicantArn: arn,
      };
      await api.post('/api/checks', { checkType: 'RECURRENT_SIMULATOR', appliesTo: 'PILOT', assignedTo: newForm.assignedTo || undefined, crewMemberId: crewMemberId || newForm.linkedCrewMemberId || nameMatch?.id || undefined, details });
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

  async function uploadLicencePhoto(check, file) {
    setError(null);
    try {
      const photo = await compressImage(file);
      const updated = await api.patch(`/api/checks/${check.id}/licence-photo`, { photo });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function setResult(check, result) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { result, completedAt: new Date().toISOString() });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
      // Only "reopening a saved check later" keeps the survey tucked behind
      // the toggle - completing it just now is exactly when the assessor
      // should fill it in, so surface it straight away in this session.
      if (result) setShowSurvey(true);
    } catch (err) { setError(err.message); }
  }

  function toggleSeat(check, currentSeats, seat) {
    const next = currentSeats.includes(seat) ? currentSeats.filter((s) => s !== seat) : [...currentSeats, seat];
    patchDetails(check, { seatCheck: next });
  }

  // HOTC/HOFO/Flight Ops Admin only - fills FSTD number/type from the
  // preset saved for this check's aircraft type (see Staff page), instead
  // of retyping the same simulator details on every check.
  async function autofillFstd(check) {
    setError(null);
    try {
      const presets = await api.get('/api/fstd-presets');
      const preset = presets.find((p) => p.aircraftType === check.details?.actype);
      if (!preset || (!preset.fstdNumber && !preset.fstdType)) {
        setError(`No FSTD preset saved for ${check.details?.actype || 'this aircraft type'} yet - set one on the Staff page.`);
        return;
      }
      await patchDetails(check, { fstdNumber: preset.fstdNumber || '', fstdType: preset.fstdType || '' });
      setFstdVersion((v) => v + 1);
    } catch (err) { setError(err.message); }
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

  function itemLetter(i) {
    return String.fromCharCode(97 + i);
  }

  // Replicates the paper form (SA 489 Proficiency Check / SA 492 IPC and
  // Proficiency Check) as closely as the data allows: boxed ARN, a 2x2
  // candidate/assessor field grid, a ruled Item No/Activities/MOS/Result
  // checklist table (Knowledge requirements + every Flight Component
  // section, in one two-column table with subsection header rows) on
  // page 1, then the Seat Check box; page 2 is Test Number/Result,
  // Applicant, FSTD, Examiner and Examiner's Comments as one continuous
  // ruled admin block, then the overall assessment and signatures.
  function printCheck(check) {
    const d = check.details || {};
    const isIpc = d.variant === 'IPC_PC';
    const results = d.results || {};
    const seatCheck = Array.isArray(d.seatCheck) ? d.seatCheck : (d.seatCheck ? [d.seatCheck] : []);
    const flightSections = flightSectionGroups.map((s) => ({
      ...s,
      allItems: s.items.filter((item) => !item.ipcOnly || isIpc),
    }));
    const title = VARIANT_LABELS[d.variant] || 'Proficiency Check';

    const recurrentRows = recurrentItems.map((item) => ({ description: item.description, mos: item.mos, result: resultMark(results[item.id]) }));

    const checklistRows = [];
    if (isIpc) {
      checklistRows.push({ header: KNOWLEDGE_SECTION });
      knowledgeItems.forEach((item, i) => {
        checklistRows.push({ no: itemLetter(i), description: item.description, mos: item.mos, result: resultMark(results[item.id]) });
      });
    }
    flightSections.forEach((s) => {
      checklistRows.push({ header: `${s.section} (Flight Component)` });
      s.allItems.forEach((item, i) => {
        checklistRows.push({ no: itemLetter(i), description: item.description, mos: item.mos, result: resultMark(results[item.id]) });
      });
    });

    const html = `
      <div class="compact">
        ${formTitleRow(title, d.applicantArn || d.arn)}
        ${fieldGrid([
          ["Candidate's Name", d.name], ['Date', d.date],
          ['Assessor(s)', d.assessor], ['Aircraft Type', d.actype],
        ])}
        ${checklistTable(recurrentRows, { withItemNo: false })}
        ${checklistTable(checklistRows, { withItemNo: true, twoColumn: true })}
        ${seatCheckBox(seatCheck)}
      </div>

      <div class="page-break"></div>
      ${formTitleRow(`${title} (continued)`, d.applicantArn || d.arn)}
      ${labeledRowGroup([
        {
          label: 'Test Number',
          cells: [
            { label: 'Test number', value: d.testNumber },
            { label: 'Result', value: resultBadge(check.result) },
          ],
        },
        { label: 'Applicant', cells: [{ label: 'ARN', value: d.applicantArn }, { label: 'Name', value: d.applicantName }, { label: 'Signature', value: d.applicantSig }] },
      ])}
      ${labeledRowGroup([
        {
          label: 'FSTD',
          cells: [
            { label: 'Date', value: d.date },
            { label: 'FSTD number', value: d.fstdNumber },
            { label: 'FSTD type', value: d.fstdType },
            { label: 'Ground time', value: d.groundTime },
            { label: 'Simulator time', value: d.simulatorTime },
          ],
        },
        { label: 'Examiner', cells: [{ label: 'ARN', value: d.examinerArn }, { label: 'Name', value: d.examinerName }, { label: 'Signature', value: d.examinerSig }] },
      ])}
      ${section("Examiner's Comments", [['Comments', d.examinerComments || '—']])}
      <div style="margin: 14px 0; font-weight: 700; font-size: 13px;">OVERALL ASSESSMENT: ${resultBadge(check.result)}</div>
      ${signatureBlock([['Applicant signature', d.applicantSig], ['Examiner signature', d.examinerSig]])}
    `;
    openPrintWindow(`${title} - ${d.name || ''}`, html);
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

    const flightSections = flightSectionGroups.map((s) => ({
      ...s,
      allItems: s.items.filter((item) => !item.ipcOnly || isIpc),
    }));
    const allRequiredItems = [
      ...recurrentItems,
      ...(isIpc ? knowledgeItems : []),
      ...flightSections.flatMap((s) => s.allItems),
    ];
    const allItemsAnswered = allRequiredItems.length > 0 && allRequiredItems.every((item) => results[item.id] !== undefined);

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={() => setSelectedId(null)}>← Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {selected.completedAt && (
              <button onClick={() => setShowSurvey((v) => !v)}>{showSurvey ? 'Hide Continuous Improvement Survey' : 'Continuous Improvement Survey'}</button>
            )}
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
          {recurrentItems.map((item) => (
            <ItemRow key={item.id} id={item.id} description={item.description} mos={item.mos} result={results[item.id]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
          ))}
        </div>

        {isIpc && (
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Knowledge requirements (Ground Component)</div>
            {knowledgeItems.map((item) => (
              <ItemRow key={item.id} id={item.id} description={item.description} mos={item.mos} result={results[item.id]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
            ))}
          </div>
        )}

        {flightSections.map((s) => (
          <div key={s.section} className="card">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>{s.section} (Flight Component)</div>
            {s.allItems.map((item) => (
              <ItemRow key={item.id} id={item.id} description={item.description} mos={item.mos} result={results[item.id]} disabled={!!selected.completedAt} onSetResult={setItemResult} />
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
          {selected.crewMemberId ? (
            <PinSignature
              label="Applicant signature" personType="crewMember" personId={selected.crewMemberId}
              signedName={d.applicantSig} signedAt={d.applicantSigAt} disabled={!!selected.completedAt}
              onSigned={(name, at) => patchDetails(selected, { applicantSig: name, applicantSigAt: at })}
            />
          ) : (
            <div className="field"><label>Applicant signature</label><input defaultValue={d.applicantSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { applicantSig: e.target.value })} /></div>
          )}
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 500 }}>FSTD</div>
            {isAdmin && !selected.completedAt && (
              <button onClick={() => autofillFstd(selected)}>Autofill FSTD</button>
            )}
          </div>
          <div className="grid2">
            <div className="field"><label>FSTD number</label><input key={`fstdNumber-${fstdVersion}`} defaultValue={d.fstdNumber} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { fstdNumber: e.target.value })} /></div>
            <div className="field"><label>FSTD type</label><input key={`fstdType-${fstdVersion}`} defaultValue={d.fstdType} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { fstdType: e.target.value })} /></div>
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
          {selected.assignedTo ? (
            <PinSignature
              label="Examiner signature" personType="user" personId={selected.assignedTo}
              signedName={d.examinerSig} signedAt={d.examinerSigAt} disabled={!!selected.completedAt}
              onSigned={(name, at) => patchDetails(selected, { examinerSig: name, examinerSigAt: at })}
            />
          ) : (
            <div className="field"><label>Examiner signature</label><input defaultValue={d.examinerSig} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerSig: e.target.value })} /></div>
          )}
          <div className="field"><label>Examiner's comments</label><textarea defaultValue={d.examinerComments} disabled={!!selected.completedAt} onBlur={(e) => patchDetails(selected, { examinerComments: e.target.value })} style={{ minHeight: 70 }} /></div>
        </div>

        {isIpc && (
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Hard-copy licence IPC entry</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              A photo of the IPC entry recorded on the candidate's physical licence. Saving here also replaces the photo held on their crew profile.
            </div>
            {d.licencePhoto && (
              <img src={d.licencePhoto} alt="Licence IPC entry" style={{ maxWidth: 260, borderRadius: 6, marginBottom: 8, display: 'block' }} />
            )}
            {!selected.completedAt && (
              <input
                type="file" accept="image/*" capture="environment"
                onChange={(e) => e.target.files[0] && uploadLicencePhoto(selected, e.target.files[0])}
              />
            )}
          </div>
        )}

        {!selected.completedAt && (
          <div className="card" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', fontSize: 12 }}>
            DO NOT SELECT UNTIL ALL THE FORM HAS BEEN COMPLETED. SELECTING THIS WILL LOCK THE FORM.
          </div>
        )}
        {!selected.completedAt && !allItemsAnswered && (
          <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Every item above must be ticked before the overall assessment can be set.
          </div>
        )}
        <div className="card">
          <div className="field">
            <label>Overall assessment</label>
            <select disabled={!!selected.completedAt || !allItemsAnswered} value={selected.result || ''} onChange={(e) => setResult(selected, e.target.value || null)}>
              <option value="">—</option>
              <option value="PASS">PASS</option>
              <option value="FAIL">FAIL</option>
            </select>
          </div>
        </div>
        {selected.completedAt && showSurvey && <CandidateSurvey checkId={selected.id} />}
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? `Archived ${label.toLowerCase()} records` : label}</div>
        {!archived && !crewArchived && isAdmin && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Add check'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          {!crewMemberId && (
            <CrewMemberPicker
              members={crewOptions}
              value={newForm.linkedCrewMemberId}
              onSelect={(m) => {
                // Carries over an examiner/instructor already assigned to
                // this candidate's upcoming IPC/PC from the Planning page.
                const planned = m?.currency?.[variant === 'IPC_PC' ? 'ipc' : 'proficiencyCheck']?.plannedAssignedTo;
                setNewForm((f) => ({
                  ...f,
                  linkedCrewMemberId: m?.id || '',
                  name: m?.name || f.name,
                  role: m?.role || f.role,
                  arn: m?.arn || f.arn,
                  // Aircraft type wasn't following the picked crew member -
                  // derive it from their fleet (FLEET_LABELS values line up
                  // exactly with AIRCRAFT_TYPES) rather than leaving it blank.
                  actype: (m?.fleets?.[0] && formatFleet(m.fleets[0])) || f.actype,
                  ...(planned && !f.assignedTo ? { assignedTo: planned.id, assessor: planned.name, examinerName: planned.name, examinerArn: planned.arn } : {}),
                }));
              }}
            />
          )}
          <AssignedToPicker
            value={newForm.assignedTo}
            accessType={variantAccessType(variant)}
            fleet={fleet}
            onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '', assessor: s?.name || f.assessor, examinerName: s?.name || f.examinerName, examinerArn: s?.arn || f.examinerArn }))}
          />
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
          <div className="field">
            <label>Candidate's rank (used to group Continuous Improvement trends by fleet and rank)</label>
            <select value={newForm.role} onChange={(e) => setNewForm({ ...newForm, role: e.target.value })}>
              <option value="">—</option>
              {RANK_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="field"><label>Applicant's ARN</label><input value={newForm.arn} onChange={(e) => setNewForm({ ...newForm, arn: e.target.value })} /></div>
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
