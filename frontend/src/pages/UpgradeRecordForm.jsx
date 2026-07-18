import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PinSignature } from '../components/PinSignature';
import { ArchiveButton } from '../components/ArchiveButton';
import { DeleteButton } from '../components/DeleteButton';
import { PrintButton } from '../components/PrintButton';
import { TabBar } from '../components/TabBar';
import { openPrintWindow, signatureBlock, resultBadge, formTitleRow, fieldGrid, tickTable, labeledRowGroup } from '../lib/print';
import { formatDate, formatUserRole, formatFleet } from '../lib/format';
import { UPGRADE_VARIANTS, UPGRADE_CHECKER_ROLES, COMPETENCY_CHECK_ASSESSOR_ROLES } from '../lib/roles';
import { visibleCheckFormItems } from '../lib/checkFormItems';
import { PersonnelCompetencyCheckEditor } from './PersonnelCompetencyCheckForm';

// One tab per "page" of the paper upgrade package, same idea as the LOFT
// package's own tab bar - Briefing, (Simulator, Training Captain only, see
// FSM E5.2.3 on SA 507), then the three flight-log stages (Observation/
// Training/Check), with the final recommendation and signatures living on
// the Check tab since that's the paper form's last page too.
const UPGRADE_SUB_TABS = [
  { key: 'BRIEFING', label: 'Briefing' },
  { key: 'OBSERVATION', label: 'Observation' },
  { key: 'TRAINING', label: 'Training' },
  { key: 'CHECK', label: 'Check' },
];

// SA 507's FSM E5.2.3 simulator training page (General Handling +
// Simulated Control Difficulty) has no equivalent on the Check Captain/
// Cabin Attendant upgrade forms - Training Captain only.
function subTabsFor(variant) {
  if (variant !== 'TRAINING_CAPTAIN') return UPGRADE_SUB_TABS;
  return [
    UPGRADE_SUB_TABS[0],
    { key: 'SIMULATOR', label: 'Simulator' },
    ...UPGRADE_SUB_TABS.slice(1),
  ];
}

// HOTC/HOFO/Alternate are always eligible to assess an upgrade regardless
// of fleet, same as everywhere else in the app - Flight Ops Admin is
// deliberately excluded, they cannot conduct any checking. Everyone else
// needs to actually hold a checker/examiner role, and (when a fleet is
// known) a matching fleet tick - this is role-based, not the checkAccess
// tick system AssignedToPicker/isEligibleForCheck uses elsewhere, since
// "who can assess an upgrade" is about holding CC/EXAMINER/CA_CHECKER/
// CA_MANAGER, not an ad hoc per-check-type tick.
const ALWAYS_ELIGIBLE_ASSESSOR_ROLES = ['HOTC', 'HOFO', 'ALTERNATE'];
function isEligibleUpgradeAssessor(staffMember, fleet) {
  if (ALWAYS_ELIGIBLE_ASSESSOR_ROLES.includes(staffMember.role)) return true;
  if (!UPGRADE_CHECKER_ROLES.includes(staffMember.role)) return false;
  return !fleet || (staffMember.fleets || []).includes(fleet);
}

function UpgradeAssessorPicker({ value, fleet, onAssign }) {
  const [staff, setStaff] = useState([]);
  useEffect(() => { api.get('/api/users/roster').then(setStaff).catch(() => {}); }, []);
  const eligible = staff.filter((s) => isEligibleUpgradeAssessor(s, fleet));
  return (
    <div className="field">
      <label>Assessor</label>
      <select value={value || ''} onChange={(e) => onAssign(eligible.find((s) => s.id === e.target.value) || null)}>
        <option value="">— Unassigned —</option>
        {eligible.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatUserRole(s.role)})</option>)}
      </select>
    </div>
  );
}

// Upgrade Records (SA 507 Training Captain, SA 510 Check Captain, SA 522
// Training Cabin Attendant, SA 523 Check Cabin Attendant) - one shared
// checkType (UPGRADE_RECORD) with a details.variant, same pattern as
// Captain in Training's PRELIMINARY/FINAL. The real paper forms are a long
// sequence of fixed-page flight blocks (Observation, Training, Check) -
// condensed here into one add-as-you-go flight log instead of hardcoding
// page counts, so a candidate needing more or fewer flights than the
// minimum doesn't need extra "pages".
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// Minimum flight counts per stage, per the operator's explicit requirement
// - shown as guidance (a running tally), not a hard gate, since real
// candidates sometimes need more with a supervisor's sign-off.
// The Check stage no longer logs a flight - its assessment is the real
// Personnel (Air) Competency Check form instead (see the CHECK tab's own
// render block further down), per the operator's explicit request.
const FLIGHT_STAGES = [
  { key: 'OBSERVATION', label: 'Observation', min: 2 },
  { key: 'TRAINING', label: 'Training', min: 2 },
];

// Verbatim wording from the operator's paper Training Captain upgrade
// package - shown (and signed) once the 2nd Training-stage flight is
// logged, per the operator's explicit request.
const TRAINING_CAPTAIN_RECOMMENDATION_TEXT = [
  'Following satisfactory completion of the required supervised line training sectors with a Check Captain, the candidate may be approved as a Training Captain. This approval is conditional and does not permit the conduct of LOFT or other training duties in an unsupervised capacity.',
  "I certify that the above-named candidate has satisfactorily completed the required supervised line training sectors in accordance with company requirements. I further confirm that the candidate has demonstrated a satisfactory standard of knowledge, instructional technique, and operational competency appropriate to the role of Training Captain. I recommend the candidate for a Flight Examiner observation during LOFT sectors for the purpose of final assessment and authorisation to conduct LOFT and other training duties in an unsupervised capacity.",
];

const RECOMMENDATIONS = [
  'Candidate is recommended for upgrade',
  'Additional training required',
  'Standard not yet met',
];

function resultFor(recommendation) {
  if (!recommendation) return null;
  return recommendation === RECOMMENDATIONS[0] ? 'PASS' : 'FAIL';
}

function emptyDetails(variant) {
  return {
    variant, date: '', briefingItems: {}, briefingComments: '',
    simulatorItems: {}, simulatorOtherTraining: '',
    flights: [], recommendation: '', assessorComments: '',
    assessorSig: '', candidateSig: '',
  };
}

function emptyFlight(stage) {
  return { id: crypto.randomUUID(), stage, date: '', route: '', method: '', airborneTime: '', topic: '', comments: '', areasOfImprovement: '', nextSortie: '' };
}

// Same "tick = signed off, and stays that way" pattern as the LOFT
// Package's own SyllabusItemRow (see SyllabusPanel.jsx) - a single tick
// (not a Yes/No pair) that, once set, records who signed it off and locks
// permanently rather than staying freely toggleable. The record's one
// Assessor (picked above the tab bar) is who signs, since a briefing
// checklist review is one sitting with one assessor - unlike the LOFT
// Package's per-item trainer picker, which exists because different
// trainers cover different items across many separate flights.
function BriefingItemRow({ description, value, disabled, assessorId, assessorName, onSignOff }) {
  const v = value || {};
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          className={`tick-btn ${v.tick ? 'active-pass' : ''}`}
          disabled={disabled || v.tick || !assessorId}
          onClick={() => setConfirming((c) => !c)}
        >{v.tick ? '✓' : ''}</button>
        <div style={{ fontSize: 13, flex: 1 }}>{description}</div>
      </div>
      {v.tick && v.signedOffByName && (
        <div style={{ fontSize: 11, color: 'var(--text-success)', marginLeft: 32 }}>
          Signed off by {v.signedOffByName}{v.completedAt ? ` on ${formatDate(v.completedAt)}` : ''}
        </div>
      )}
      {!v.tick && !disabled && !assessorId && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 32 }}>Assign an assessor above before signing off items.</div>
      )}
      {confirming && (
        <div style={{ marginLeft: 32, marginTop: 4, display: 'flex', gap: 6 }}>
          <button type="button" className="primary" onClick={() => { onSignOff(); setConfirming(false); }}>Sign off as {assessorName}</button>
          <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// Aircraft vs Simulator as a tick, not a free-text field someone types
// "Sim" or "Aircraft" into.
const FLIGHT_METHODS = [
  { key: 'AIRCRAFT', label: 'Aircraft' },
  { key: 'SIMULATOR', label: 'Simulator' },
];

// Every field is buffered in local state and only sent to the server
// onBlur, not on every keystroke. The previous version called onChange
// (which round-trips through patchDetails -> api.patch -> setChecks from
// the server response) on every keystroke while the input stayed
// *controlled* off the (not-yet-updated) parent prop - fast typing outran
// the round trip and a stale server response landing between keystrokes
// would overwrite what had just been typed, which is what caused text to
// visibly vanish while typing a route. Buffering locally and committing
// on blur is the same pattern already used for the free-text boxes
// elsewhere in this form (briefingComments, assessorComments, etc).
function FlightRow({ flight, disabled, onChange, onRemove }) {
  const stageConfig = FLIGHT_STAGES.find((s) => s.key === flight.stage);
  const [local, setLocal] = useState(flight);
  useEffect(() => { setLocal(flight); }, [flight.id]);

  function set(key, value) { setLocal((l) => ({ ...l, [key]: value })); }
  function commit() { onChange(local); }
  function setMethod(method) {
    const updated = { ...local, method };
    setLocal(updated);
    onChange(updated);
  }

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{stageConfig?.label || flight.stage}</div>
        {!disabled && <button type="button" className="danger" onClick={onRemove}>Remove</button>}
      </div>
      <div className="grid2">
        <div className="field" style={{ margin: 0 }}><label>Date</label><input type="date" value={local.date} disabled={disabled} onChange={(e) => set('date', e.target.value)} onBlur={commit} /></div>
        <div className="field" style={{ margin: 0 }}><label>Route</label><input value={local.route} disabled={disabled} onChange={(e) => set('route', e.target.value)} onBlur={commit} /></div>
      </div>
      <div className="grid2">
        <div className="field" style={{ margin: 0 }}>
          <label>Method</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {FLIGHT_METHODS.map((m) => (
              <button key={m.key} type="button" className={`tick-btn ${local.method === m.key ? 'active-pass' : ''}`} style={{ width: 'auto', padding: '0 12px' }} disabled={disabled} onClick={() => setMethod(m.key)}>{m.label}</button>
            ))}
          </div>
        </div>
        <div className="field" style={{ margin: 0 }}><label>Airborne time</label><input value={local.airborneTime} disabled={disabled} onChange={(e) => set('airborneTime', e.target.value)} onBlur={commit} /></div>
      </div>
      <div className="field"><label>Topic</label><input value={local.topic} disabled={disabled} onChange={(e) => set('topic', e.target.value)} onBlur={commit} /></div>
      <div className="field"><label>Comments</label><input value={local.comments} disabled={disabled} onChange={(e) => set('comments', e.target.value)} onBlur={commit} /></div>
      {flight.stage === 'TRAINING' && (
        <div className="grid2">
          <div className="field" style={{ margin: 0 }}><label>Areas of improvement</label><input value={local.areasOfImprovement} disabled={disabled} onChange={(e) => set('areasOfImprovement', e.target.value)} onBlur={commit} /></div>
          <div className="field" style={{ margin: 0 }}><label>Next sortie</label><input value={local.nextSortie} disabled={disabled} onChange={(e) => set('nextSortie', e.target.value)} onBlur={commit} /></div>
        </div>
      )}
    </div>
  );
}

// crewMemberId is the candidate (a line Captain/Cabin Attendant, whether or
// not they're already linked to a staff account - see checks.js POST
// /:id/apply-upgrade, which requires that link before it can update their
// role/seed their Personnel Air Competency date).
export function UpgradeRecordForm({ variant, crewMemberId, crewMemberName, fleet, crewIsLinked, archived = false }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const canCreate = isAdmin || UPGRADE_CHECKER_ROLES.includes(user.role);
  const [checks, setChecks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [subTab, setSubTab] = useState(UPGRADE_SUB_TABS[0].key);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ date: '', assignedTo: '' });
  const [error, setError] = useState(null);
  const [applyNotice, setApplyNotice] = useState(null);
  const [personnelCheck, setPersonnelCheck] = useState(null);

  // Always land back on Briefing when opening a (possibly different) record.
  useEffect(() => { setSubTab(UPGRADE_SUB_TABS[0].key); }, [selectedId]);

  const variantConfig = UPGRADE_VARIANTS[variant];
  const label = variantConfig.label;

  // The briefing checklist is editable from the Syllabus tab (Check Forms)
  // rather than fixed in source - see check-form-items.js's
  // UPGRADE_TRAINING_CAPTAIN/UPGRADE_CHECK_CAPTAIN/UPGRADE_TRAINING_CABIN_ATTENDANT/
  // UPGRADE_CHECK_CABIN_ATTENDANT form keys. Results are keyed by each
  // item's id instead of its description text.
  const [allBriefingItems, setAllBriefingItems] = useState([]);
  useEffect(() => {
    api.get(`/api/check-form-items?formKey=UPGRADE_${variant}&includeArchived=true`).then(setAllBriefingItems).catch(() => {});
  }, [variant]);

  // Simulator training (SA 507 FSM E5.2.3) - Training Captain only, same
  // editable-from-Syllabus pattern as the briefing checklist above.
  const [allSimulatorItems, setAllSimulatorItems] = useState([]);
  useEffect(() => {
    if (variant !== 'TRAINING_CAPTAIN') { setAllSimulatorItems([]); return; }
    api.get('/api/check-form-items?formKey=UPGRADE_TRAINING_CAPTAIN_SIMULATOR&includeArchived=true').then(setAllSimulatorItems).catch(() => {});
  }, [variant]);

  // Who's eligible to conduct the Check tab's Personnel (Air) Competency
  // Check - a different, narrower list than UPGRADE_CHECKER_ROLES (the
  // upgrade record's own assessor), matching the standalone SA518 form.
  const [personnelCheckStaff, setPersonnelCheckStaff] = useState([]);
  useEffect(() => { api.get('/api/users/roster').then(setPersonnelCheckStaff).catch(() => {}); }, []);
  const personnelCheckAssessors = personnelCheckStaff.filter((s) => COMPETENCY_CHECK_ASSESSOR_ROLES.includes(s.role));

  function load() {
    api.get(`/api/checks?checkType=UPGRADE_RECORD&archived=${archived}&crewMemberId=${crewMemberId}`)
      .then((all) => setChecks(all.filter((c) => c.details?.variant === variant)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [variant, archived, crewMemberId]);

  const selected = checks.find((c) => c.id === selectedId);

  async function createCheck(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/checks', {
        checkType: 'UPGRADE_RECORD', appliesTo: variantConfig.crewType,
        crewMemberId,
        assignedTo: newForm.assignedTo || undefined,
        details: { ...emptyDetails(variant), date: newForm.date },
      });
      setCreating(false);
      setNewForm({ date: '', assignedTo: '' });
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

  function signOffItem(check, listKey, itemId) {
    const signed = { tick: true, signedOffById: check.assignedTo, signedOffByName: check.assignedToName, completedAt: new Date().toISOString() };
    patchDetails(check, { [listKey]: { ...(check.details?.[listKey] || {}), [itemId]: signed } });
  }
  function setBriefingItem(check, key) { signOffItem(check, 'briefingItems', key); }
  function setSimulatorItem(check, key) { signOffItem(check, 'simulatorItems', key); }

  function addFlight(check, stage) {
    patchDetails(check, { flights: [...(check.details?.flights || []), emptyFlight(stage)] });
  }
  function updateFlight(check, id, patch) {
    patchDetails(check, { flights: (check.details?.flights || []).map((f) => (f.id === id ? patch : f)) });
  }
  function removeFlight(check, id) {
    patchDetails(check, { flights: (check.details?.flights || []).filter((f) => f.id !== id) });
  }

  async function setRecommendation(check, recommendation) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, {
        details: { ...check.details, recommendation },
        result: resultFor(recommendation),
        completedAt: new Date().toISOString(),
      });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  async function applyUpgrade(check) {
    setError(null);
    setApplyNotice(null);
    try {
      const updated = await api.post(`/api/checks/${check.id}/apply-upgrade`);
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
      setApplyNotice(`Staff record updated - ${crewMemberName} is now ${formatUserRole(variantConfig.targetRole)}, and their Personnel (Air) Competency Check is now current for 24 months.`);
    } catch (err) { setError(err.message); }
  }

  async function reassign(check, staffMember) {
    setError(null);
    try {
      const updated = await api.patch(`/api/checks/${check.id}`, { assignedTo: staffMember?.id || null });
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) { setError(err.message); }
  }

  // The Check tab's assessment is the real Personnel (Air) Competency Check
  // form (SA518), not a flight log - loaded once the record has a linked
  // details.personnelCheckId (see checks.js POST /:id/personnel-check).
  useEffect(() => {
    const personnelCheckId = selected?.details?.personnelCheckId;
    if (!personnelCheckId) { setPersonnelCheck(null); return; }
    api.get(`/api/personnel-checks/${personnelCheckId}`).then(setPersonnelCheck).catch(() => setPersonnelCheck(null));
  }, [selected?.details?.personnelCheckId]);

  async function startPersonnelCheck(check) {
    setError(null);
    try {
      await api.post(`/api/checks/${check.id}/personnel-check`);
      load();
    } catch (err) { setError(err.message); }
  }

  async function savePersonnelCheck(patch) {
    setError(null);
    try {
      const updated = await api.patch(`/api/personnel-checks/${personnelCheck.id}`, patch);
      setPersonnelCheck(updated);
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

  // A ruled Tick/Item table plus subsection headers, matching how the
  // Simulator tab groups its own items by section (General Handling /
  // Simulated Control Difficulty) - shared by the on-screen Briefing and
  // Simulator sections' print output below.
  function tickTableRows(allItems, savedItems) {
    const rows = [];
    let lastSection = null;
    for (const item of visibleCheckFormItems(allItems, savedItems)) {
      if (item.section && item.section !== lastSection) rows.push({ header: item.section });
      lastSection = item.section || lastSection;
      rows.push({ description: item.description, tick: savedItems[item.id]?.tick ? '✓' : '' });
    }
    return rows;
  }

  // One bordered section per logged flight, close to the paper form's own
  // per-flight boxes (Route/Aircraft/Airborne time fields, then
  // Topic/Comments/Areas of improvement/Next sortie as free text below) -
  // our digital log condenses what's several fixed pages on paper into one
  // add-as-you-go entry per flight, so this reproduces that box style
  // without trying to match page-for-page.
  function flightSection(f, i, stage) {
    let extra = '';
    if (f.topic) extra += `<div style="padding:6px 10px 0;font-size:11px;"><b>Topic:</b> ${f.topic}</div>`;
    if (f.comments) extra += `<div style="padding:6px 10px 0;font-size:11px;"><b>Comments:</b> ${f.comments}</div>`;
    if (stage.key === 'TRAINING' && f.areasOfImprovement) extra += `<div style="padding:6px 10px 0;font-size:11px;"><b>Areas of improvement:</b> ${f.areasOfImprovement}</div>`;
    if (stage.key === 'TRAINING' && f.nextSortie) extra += `<div style="padding:6px 10px 6px;font-size:11px;"><b>Next sortie:</b> ${f.nextSortie}</div>`;
    return `<div class="form-section">
      <h2>Flight ${i + 1}${f.date ? ` — ${formatDate(f.date)}` : ''}</h2>
      ${fieldGrid([['Route', f.route], ['Method', f.method === 'AIRCRAFT' ? 'Aircraft' : f.method === 'SIMULATOR' ? 'Simulator' : ''], ['Airborne time', f.airborneTime]])}
      ${extra}
    </div>`;
  }

  function printCheck(check) {
    const d = check.details || {};
    const items = d.briefingItems || {};
    let body = formTitleRow(label);
    body += fieldGrid([
      ['Candidate', crewMemberName],
      ['Aircraft Type', fleet ? formatFleet(fleet) : ''],
      ['Date', d.date ? formatDate(d.date) : ''],
      ['Assessor', check.assignedToName ? `${check.assignedToRole ? formatUserRole(check.assignedToRole) : ''} ${check.assignedToName}`.trim() : ''],
    ]);
    body += tickTable(tickTableRows(allBriefingItems, items));
    if (d.briefingComments) body += `<div style="padding:6px 10px;font-size:11px;"><b>Comments:</b> ${d.briefingComments}</div>`;

    if (variant === 'TRAINING_CAPTAIN') {
      const simItems = d.simulatorItems || {};
      body += `<div class="page-break"></div>`;
      body += formTitleRow(`${label} (continued) — Simulator Training`);
      body += tickTable(tickTableRows(allSimulatorItems, simItems));
      if (d.simulatorOtherTraining) body += `<div style="padding:6px 10px;font-size:11px;"><b>Optional simulator training:</b> ${d.simulatorOtherTraining}</div>`;
    }

    for (const stage of FLIGHT_STAGES) {
      const rows = (d.flights || []).filter((f) => f.stage === stage.key);
      if (rows.length === 0) continue;
      body += `<div class="page-break"></div>`;
      body += formTitleRow(`${label} (continued) — ${stage.label}`);
      body += rows.map((f, i) => flightSection(f, i, stage)).join('');
      if (stage.key === 'TRAINING' && variant === 'TRAINING_CAPTAIN' && rows.length >= 2) {
        body += `<div class="disclaimer">${TRAINING_CAPTAIN_RECOMMENDATION_TEXT[0]}</div>`;
        body += `<div style="padding:6px 10px;font-size:11px;">${TRAINING_CAPTAIN_RECOMMENDATION_TEXT[1]}</div>`;
        body += signatureBlock([['Assessor signature (Training Captain recommendation)', d.trainingRecommendationSig]]);
      }
    }

    if (d.personnelCheckId && personnelCheck) {
      body += `<div class="page-break"></div>`;
      body += formTitleRow(`${label} (continued) — Personnel (Air) Competency Check`);
      body += fieldGrid([
        ['Training / Check Type', personnelCheck.trainingCheckType || ''],
        ['Date', personnelCheck.checkDate ? formatDate(personnelCheck.checkDate) : ''],
        ['Assessor', personnelCheck.assessorName || ''],
        ['Status', personnelCheck.completedAt ? `Completed ${formatDate(personnelCheck.completedAt)}` : 'In progress'],
      ]);
      if (personnelCheck.comments) body += `<div style="padding:6px 10px;font-size:11px;"><b>Comments:</b> ${personnelCheck.comments}</div>`;
      if (personnelCheck.recommendations) body += `<div style="padding:6px 10px;font-size:11px;"><b>Recommendations:</b> ${personnelCheck.recommendations}</div>`;
      body += signatureBlock([['Personnel Competency Check assessor', personnelCheck.certifiedSignature]]);
    }

    body += `<div class="page-break"></div>`;
    body += formTitleRow(`${label} (continued) — Recommendation`);
    body += labeledRowGroup([
      { label: 'Recommendation', cells: [{ label: 'Final Recommendation', value: d.recommendation || '' }, { label: 'Overall assessment', value: resultBadge(check.result) }] },
    ]);
    if (d.assessorComments) body += `<div style="padding:6px 10px;font-size:11px;"><b>Assessor Comments:</b> ${d.assessorComments}</div>`;
    body += signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]]);
    openPrintWindow(`${label} - ${crewMemberName}`, body);
  }

  if (selected) {
    const d = selected.details || {};
    const items = d.briefingItems || {};
    const simItems = d.simulatorItems || {};
    const flights = d.flights || [];
    const locked = !!selected.completedAt;
    const briefingItems = visibleCheckFormItems(allBriefingItems, items);
    const allBriefingAnswered = briefingItems.length > 0 && briefingItems.every((item) => !!items[item.id]?.tick);
    const personnelCheckComplete = !!personnelCheck?.completedAt;
    const simulatorItems = visibleCheckFormItems(allSimulatorItems, simItems);
    const simulatorBySection = simulatorItems.reduce((acc, item) => {
      (acc[item.section || 'General Handling'] ||= []).push(item);
      return acc;
    }, {});
    const canApply = selected.result === 'PASS' && selected.completedAt && !d.staffRecordUpdatedAt;

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={() => setSelectedId(null)}>← Back</button>
          <div style={{ display: 'flex', gap: 6 }}>
            {(selected.archived || selected.completedAt) && <PrintButton onPrint={() => printCheck(selected)} />}
            <ArchiveButton archived={selected.archived} canArchive={!!selected.result} onArchive={() => archiveCheck(selected)} onUnarchive={() => unarchiveCheck(selected)} />
            <DeleteButton archived={selected.archived} onDelete={() => deleteCheck(selected)} />
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 16, fontWeight: 500 }}>{crewMemberName} — {label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.date ? formatDate(d.date) : 'No date'}</div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {selected.assignedToName ? `${selected.assignedToRole ? formatUserRole(selected.assignedToRole) : 'Assessor'} ${selected.assignedToName}${selected.assignedToArn ? ` · ARN ${selected.assignedToArn}` : ''}` : 'Unassigned'}
          </div>
          <UpgradeAssessorPicker value={selected.assignedTo} fleet={fleet} onAssign={(s) => reassign(selected, s)} />
        </div>

        <TabBar tabs={subTabsFor(variant)} active={subTab} onSelect={setSubTab} />

        {subTab === 'BRIEFING' && (
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Briefing</div>
            {briefingItems.map((item) => (
              <BriefingItemRow key={item.id} description={item.description} value={items[item.id]} disabled={locked} assessorId={selected.assignedTo} assessorName={selected.assignedToName} onSignOff={() => setBriefingItem(selected, item.id)} />
            ))}
            <div className="field"><label>Briefing comments</label><textarea defaultValue={d.briefingComments} disabled={locked} onBlur={(e) => patchDetails(selected, { briefingComments: e.target.value })} style={{ minHeight: 60 }} /></div>
          </div>
        )}

        {subTab === 'SIMULATOR' && variant === 'TRAINING_CAPTAIN' && (
          <div className="card">
            <div style={{ fontWeight: 500, marginBottom: 8 }}>Required Simulator Training</div>
            {Object.entries(simulatorBySection).map(([sectionName, sectionItems]) => (
              <div key={sectionName} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{sectionName}</div>
                {sectionItems.map((item) => (
                  <BriefingItemRow key={item.id} description={item.description} value={simItems[item.id]} disabled={locked} assessorId={selected.assignedTo} assessorName={selected.assignedToName} onSignOff={() => setSimulatorItem(selected, item.id)} />
                ))}
              </div>
            ))}
            {simulatorItems.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No required simulator training items configured yet - add them from Syllabus &gt; Check Forms.</div>
            )}
            <div className="field">
              <label>Optional simulator training (any additional simulator sessions conducted)</label>
              <textarea defaultValue={d.simulatorOtherTraining} disabled={locked} onBlur={(e) => patchDetails(selected, { simulatorOtherTraining: e.target.value })} style={{ minHeight: 60 }} />
            </div>
          </div>
        )}

        {['OBSERVATION', 'TRAINING'].includes(subTab) && (() => {
          const stage = FLIGHT_STAGES.find((s) => s.key === subTab);
          const rows = flights.filter((f) => f.stage === stage.key);
          return (
            <>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 500 }}>{stage.label} <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12 }}>({rows.length}/{stage.min} min)</span></div>
                  {!locked && <button type="button" onClick={() => addFlight(selected, stage.key)}>+ Add flight</button>}
                </div>
                {rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No flights logged yet.</div>}
                {rows.map((f) => (
                  <FlightRow key={f.id} flight={f} disabled={locked} onChange={(patch) => updateFlight(selected, f.id, patch)} onRemove={() => removeFlight(selected, f.id)} />
                ))}
              </div>
              {stage.key === 'TRAINING' && variant === 'TRAINING_CAPTAIN' && rows.length >= 2 && (
                <div className="card">
                  <div style={{ fontWeight: 500, marginBottom: 8 }}>Training Captain Recommendation</div>
                  {TRAINING_CAPTAIN_RECOMMENDATION_TEXT.map((p, i) => (
                    <p key={i} style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: i === 0 ? 0 : 10 }}>{p}</p>
                  ))}
                  {selected.assignedTo ? (
                    <PinSignature
                      label="Assessor signature" personType="user" personId={selected.assignedTo}
                      signedName={d.trainingRecommendationSig} signedAt={d.trainingRecommendationSigAt} disabled={locked}
                      onSigned={(name, at) => patchDetails(selected, { trainingRecommendationSig: name, trainingRecommendationSigAt: at })}
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Assign an assessor above before signing.</div>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {subTab === 'CHECK' && (
          <>
            <div className="card">
              <div style={{ fontWeight: 500, marginBottom: 8 }}>Flight Standards Personnel (Air) Competency Check</div>
              {!d.personnelCheckId ? (
                crewIsLinked ? (
                  !locked && <button type="button" onClick={() => startPersonnelCheck(selected)}>Start Personnel (Air) Competency Check</button>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-warning)' }}>
                    {crewMemberName} doesn't have a staff account yet - add them via the Staff tab (tick "This is an existing crew member") first.
                  </div>
                )
              ) : personnelCheck ? (
                <PersonnelCompetencyCheckEditor
                  check={personnelCheck}
                  userName={crewMemberName}
                  candidateRole={variantConfig.targetRole}
                  assessors={personnelCheckAssessors}
                  disabled={locked}
                  onPatch={savePersonnelCheck}
                />
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading…</div>
              )}
            </div>

            <div className="card">
              <div className="field"><label>Assessor comments</label><textarea defaultValue={d.assessorComments} disabled={locked} onBlur={(e) => patchDetails(selected, { assessorComments: e.target.value })} style={{ minHeight: 70 }} /></div>
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
            {!locked && !allBriefingAnswered && (
              <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Every briefing item on the Briefing tab must be answered before the final recommendation can be set.
              </div>
            )}
            {!locked && allBriefingAnswered && !personnelCheckComplete && (
              <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                The Personnel (Air) Competency Check above must be completed and signed before the final recommendation can be set.
              </div>
            )}
            <div className="card">
              <div className="field">
                <label>Final Recommendation</label>
                <select disabled={locked || !allBriefingAnswered || !personnelCheckComplete} value={d.recommendation || ''} onChange={(e) => setRecommendation(selected, e.target.value || '')}>
                  <option value="">—</option>
                  {RECOMMENDATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {selected.completedAt && (
              <div className="card">
                <div style={{ fontWeight: 500, marginBottom: 8 }}>Staff record</div>
                {d.staffRecordUpdatedAt ? (
                  <div style={{ fontSize: 13, color: 'var(--text-success)' }}>
                    Staff record updated {formatDate(d.staffRecordUpdatedAt)} — {crewMemberName} is now {formatUserRole(variantConfig.targetRole)}.
                  </div>
                ) : canApply ? (
                  crewIsLinked ? (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Passing this record means {crewMemberName} should now be {formatUserRole(variantConfig.targetRole)}, with their Personnel (Air) Competency Check current for 24 months from today.
                      </div>
                      <button className="primary" onClick={() => applyUpgrade(selected)}>Update Staff Role to {formatUserRole(variantConfig.targetRole)}</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-warning)' }}>
                      {crewMemberName} doesn't have a staff account yet - add them via the Staff tab (tick "This is an existing crew member"), then come back here to update their role and Personnel Competency date.
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Only applies once the final recommendation is "{RECOMMENDATIONS[0]}".</div>
                )}
                {applyNotice && <div style={{ fontSize: 12, color: 'var(--text-success)', marginTop: 6 }}>{applyNotice}</div>}
              </div>
            )}
          </>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{archived ? `Archived ${label.toLowerCase()} records` : label}</div>
        {!archived && canCreate && <button onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'Start upgrade record'}</button>}
      </div>

      {!archived && creating && (
        <form className="card" onSubmit={createCheck}>
          <div className="field"><label>Date</label><input type="date" value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} /></div>
          <UpgradeAssessorPicker value={newForm.assignedTo} fleet={fleet} onAssign={(s) => setNewForm((f) => ({ ...f, assignedTo: s?.id || '' }))} />
          <button type="submit" className="primary">Create upgrade record</button>
        </form>
      )}
      {error && <div className="error-text">{error}</div>}

      {checks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {archived ? 'archived ' : ''}{label.toLowerCase()} records yet.</div>}
      {checks.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.details?.date ? formatDate(c.details.date) : 'No date'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.assignedToName ? `Assessor: ${c.assignedToName}` : 'Unassigned'}</div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}
