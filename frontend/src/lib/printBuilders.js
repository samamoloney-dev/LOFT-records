// Pure HTML-building functions extracted from each check form's own
// printCheck()/printForm() (EpChecks.jsx, CaChecks.jsx, ProficiencyChecks.jsx,
// PilotLineCheck.jsx, CtlForm.jsx, CaptainInTrainingForm.jsx,
// LandingAssessmentForm.jsx, UpgradeRecordForm.jsx,
// GroundInstructorCheckForm.jsx, PersonnelCompetencyCheckForm.jsx,
// ArchivedFlights.jsx) - each of those still calls its own builder here and
// then openPrintWindow, unchanged from the caller's point of view. Split out
// so a combined "Print user's file" (see CrewDetail.jsx's printCrewFile) can
// build the exact same per-form HTML without needing that form's own
// interactive component mounted - just the same data each already fetches
// (the check/form record itself plus its check-form-items catalogue).
import {
  section, signatureBlock, resultBadge, formTitleRow, fieldGrid,
  checklistTable, seatCheckBox, labeledRowGroup, tickTable,
} from './print';
import { formatDate, formatUserRole } from './format';
import { competencyStatus } from './dueStatus';
import { visibleCheckFormItems } from './checkFormItems';

// ---- Emergency Procedures (EpChecks.jsx) ----
export function buildEpCheckHtml(check, epItems) {
  const d = check.details || {};
  const itemRows = visibleCheckFormItems(epItems, d.items).map((item) => [item.description, d.items?.[item.id] === 'S' ? '✓' : d.items?.[item.id] === 'X' ? '✗' : d.items?.[item.id] === 'N' ? 'N (Not Tested)' : '']);
  return `
    <h1>Emergency Procedures Check</h1>
    <div class="meta">${d.name || ''} · ${d.date ? formatDate(d.date) : ''} · ${(d.types || []).join(', ') || 'No type selected'}</div>
    ${section('Details', [
      ['Aircraft type', d.actype],
      ['Assessor', d.assessor],
      ['Assigned to', check.assignedToName ? `${check.assignedToName}${check.assignedToArn ? ` (ARN ${check.assignedToArn})` : ''}` : 'Unassigned'],
    ])}
    ${section('Assessment items', itemRows)}
    ${section('Assessment', [
      ['Life Jacket Training (Wet Drill) date', d.lifeJacketNa ? 'N/A' : d.lifeJacketDate],
      ['Scenarios selected', d.scenarios],
      ['Comments', d.comments],
      ['Overall assessment', resultBadge(check.result)],
      ['Overall score', check.score],
    ])}
    <div class="disclaimer">We, the undersigned, do hereby mutually agree upon and accept the comment written in this document as being a correct and honest account of the performance of the Applicant in each and every procedure carried out.</div>
    ${signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]])}
  `;
}

// ---- Cabin Attendant Line Check (CaChecks.jsx) ----
export function buildCaLineCheckHtml(check, caItems, ntsMarkers) {
  const d = check.details || {};
  const itemRows = visibleCheckFormItems(caItems, d.items).map((item) => [item.description, d.items?.[item.id] === 'S' ? '✓' : d.items?.[item.id] === 'X' ? '✗' : d.items?.[item.id] === 'N' ? 'N/A' : '']);
  const visibleNtsMarkers = ntsMarkers.filter((m) => !m.archived || d.nts?.[`score-${m.id}`] !== undefined || d.nts?.[`code-${m.id}`] !== undefined);
  const ntsRows = visibleNtsMarkers.map((m) => [m.description, `Score ${d.nts?.[`score-${m.id}`] || '—'} · Code ${d.nts?.[`code-${m.id}`] || '—'}`]);
  return `
    <h1>Cabin Attendant Line Check (SA 540)</h1>
    <div class="meta">${d.name || ''} · ${d.actype || 'No aircraft type'} · ${d.date ? formatDate(d.date) : ''}</div>
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
}

// ---- IPC / Proficiency Check (ProficiencyChecks.jsx) ----
const VARIANT_LABELS = { PC: 'Proficiency Check', IPC_PC: 'IPC and Proficiency Check' };
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
function pcResultMark(v) {
  return v === 'S' ? '✓' : v === 'X' ? '✗' : v === 'N' ? 'N/A' : '';
}
function itemLetter(i) {
  return String.fromCharCode(97 + i);
}

export function buildProficiencyCheckHtml(check, pcItems) {
  const d = check.details || {};
  const isIpc = d.variant === 'IPC_PC';
  const results = d.results || {};
  const seatCheck = Array.isArray(d.seatCheck) ? d.seatCheck : (d.seatCheck ? [d.seatCheck] : []);
  const allRecurrentItems = pcItems.filter((item) => item.section === RECURRENT_SECTION);
  const allKnowledgeItems = pcItems.filter((item) => item.section === KNOWLEDGE_SECTION);
  const allFlightSectionGroups = groupFlightSections(pcItems);
  const recurrentItems = visibleCheckFormItems(allRecurrentItems, results);
  const knowledgeItems = visibleCheckFormItems(allKnowledgeItems, results);
  const flightSections = allFlightSectionGroups.map((s) => ({
    ...s,
    allItems: visibleCheckFormItems(s.items.filter((item) => !item.ipcOnly || isIpc), results),
  }));
  const title = VARIANT_LABELS[d.variant] || 'Proficiency Check';

  const recurrentRows = recurrentItems.map((item) => ({ description: item.description, mos: item.mos, result: pcResultMark(results[item.id]) }));

  const checklistRows = [];
  if (isIpc) {
    checklistRows.push({ header: KNOWLEDGE_SECTION });
    knowledgeItems.forEach((item, i) => {
      checklistRows.push({ no: itemLetter(i), description: item.description, mos: item.mos, result: pcResultMark(results[item.id]) });
    });
  }
  flightSections.forEach((s) => {
    checklistRows.push({ header: `${s.section} (Flight Component)` });
    s.allItems.forEach((item, i) => {
      checklistRows.push({ no: itemLetter(i), description: item.description, mos: item.mos, result: pcResultMark(results[item.id]) });
    });
  });

  return `
    <div class="compact">
      ${formTitleRow(title, d.applicantArn || d.arn)}
      ${fieldGrid([
        ["Candidate's Name", d.name], ['Date', d.date ? formatDate(d.date) : ''],
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
          { label: 'Date', value: d.date ? formatDate(d.date) : '' },
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
}

// ---- Pilot Line Check (PilotLineCheck.jsx) ----
const REFRESHER_ITEM_NAME = 'Refresher training and check';
const LINE_CHECK_SEAT_OPTIONS = ['LHS', 'RHS'];

function groupBySection(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.section || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()];
}

export function buildPilotLineCheckHtml(check, items, refresherCompetency, crewMemberName) {
  const d = check.details || {};
  const results = d.results || {};
  const seatCheck = Array.isArray(d.seatCheck) ? d.seatCheck : [];
  const allTickableItems = items.filter((i) => i.description !== REFRESHER_ITEM_NAME);
  const sections = groupBySection(visibleCheckFormItems(allTickableItems, results));
  const isCurrent = !!refresherCompetency && !refresherCompetency.na && !!refresherCompetency.dueDate && competencyStatus(refresherCompetency.dueDate) !== 'overdue';
  const rows = [{ header: 'General' }, { description: REFRESHER_ITEM_NAME, tick: isCurrent ? '✓ Current' : 'Not current' }];
  for (const [sectionName, sectionItems] of sections) {
    rows.push({ header: sectionName });
    for (const item of sectionItems) {
      const v = results[item.id];
      let tick = '';
      if (item.kind === 'text') tick = v || '';
      else if (item.kind === 'score') tick = v !== undefined ? String(v) : '';
      else tick = v === true ? '✓' : v === false ? '✗' : '';
      rows.push({ description: item.description, tick });
    }
  }
  return `
    <div class="compact">
      <h1>Line Check</h1>
      <div class="meta">${crewMemberName} · ${d.actype || 'No aircraft type'} · ${d.date ? formatDate(d.date) : ''}</div>
      ${tickTable(rows, { twoColumn: true })}
      <div style="display:flex;justify-content:center;">${seatCheckBox(seatCheck, LINE_CHECK_SEAT_OPTIONS, 'Check Conducted In', null)}</div>
      ${section('Details', [
        ['Assessor', d.assessor],
        ['Assessor ARN', d.assessorArn],
        ['Comments', d.comments],
        ['Overall assessment', resultBadge(check.result)],
        ['Overall score', check.score],
      ])}
    </div>
    ${signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]])}
  `;
}

// ---- Check to Line (CtlForm.jsx) ----
const CA_ASSESSMENT_ITEMS = [
  'Competent on all duties and procedures from sign on to sign off without any assistance',
  'Knowledge on all Rules and Regulations is up to standard',
  'Knowledge on all Emergency Procedures is up to standard',
  'Knowledge on all Emergency and Survival Equipment is up to standard',
  'Knowledge on Aviation Medicine and First Aid is up to standard',
  'Satisfactorily completed all items of the training record and discussion list; recommended for a Check to Line',
];

function ctlStatusLabel(v) {
  return v === true ? '✓' : v === false ? '✗' : v === 'SATISFACTORY' ? '✓' : v === 'UNSATISFACTORY' ? '✗' : v === 'NA' ? 'N/A' : '';
}

// `data` is the raw GET /api/ctl/:traineeId response shape: { form, items, ntsMarkers }.
export function buildCtlFormHtml(data, traineeType) {
  const isCabinAttendant = traineeType === 'CABIN_ATTENDANT';
  const form = data.form || {};
  const visibleItems = visibleCheckFormItems(data.items, form.assessmentItems || {});
  const grouped = new Map();
  if (!isCabinAttendant) {
    for (const item of visibleItems) {
      if (!grouped.has(item.section)) grouped.set(item.section, []);
      grouped.get(item.section).push(item);
    }
  }

  let body = `<h1>Check to Line Assessment</h1>`;
  body += `<div class="meta">Completed ${form.completedAt ? formatDate(form.completedAt) : '—'} · ${form.assignedToName ? `${form.assignedToRole ? formatUserRole(form.assignedToRole) : 'Assigned to'} ${form.assignedToName}${form.assignedToArn ? ` (ARN ${form.assignedToArn})` : ''}` : 'Unassigned'}</div>`;

  if (isCabinAttendant) {
    body += section('Assessment', CA_ASSESSMENT_ITEMS.map((item) => [item, ctlStatusLabel(form.assessmentItems?.[item])]));
  } else {
    body += section('Sectors 1 & 2', [
      ['Route', form.sectorDetails?.sectors12?.route], ['Aircraft', form.sectorDetails?.sectors12?.aircraft],
      ['Date', form.sectorDetails?.sectors12?.date ? formatDate(form.sectorDetails.sectors12.date) : ''], ['Flight time (this flight)', form.sectorDetails?.sectors12?.thisFlight],
      ['Progressive total', form.sectorDetails?.sectors12?.progressiveTotal],
    ]);
    body += section('Sectors 3 & 4', [
      ['Route', form.sectorDetails?.sectors34?.route], ['Aircraft', form.sectorDetails?.sectors34?.aircraft],
      ['Date', form.sectorDetails?.sectors34?.date ? formatDate(form.sectorDetails.sectors34.date) : ''], ['Flight time (this flight)', form.sectorDetails?.sectors34?.thisFlight],
      ['Total LOFT', form.sectorDetails?.sectors34?.progressiveTotal],
    ]);
    for (const [category, catItems] of grouped.entries()) {
      body += section(category, catItems.map((item) => {
        const v = form.assessmentItems?.[item.id];
        return [item.description, item.kind === 'text' ? (v || '') : ctlStatusLabel(v)];
      }));
    }
    body += section('Non Technical Skill Assessment', (data.ntsMarkers || []).map((m) => [m, form.ntsScores?.[m] || '—']));
    body += section('Comments', [['Comments', form.comments]]);
    body += `<div class="disclaimer">We the undersigned, do hereby mutually agree upon and accept the comments written in this document as being a correct and honest account of the performance of the trainee in each and every check procedure carried out.</div>`;
  }

  body += section('Result', [
    ['Overall result', resultBadge(form.overallResult)],
    ...(!isCabinAttendant ? [['Overall score', form.overallScore]] : []),
  ]);
  if (!isCabinAttendant) {
    body += signatureBlock([["Assessor's signature", form.assessorSignature], ['Candidate signature', form.candidateSignature]]);
  }
  return body;
}

// ---- Captain in Training (CaptainInTrainingForm.jsx) ----
const CIT_VARIANT_LABELS = { PRELIMINARY: 'Captain in Training — Preliminary Assessment', FINAL: 'Captain in Training — Final Assessment' };
const PRELIM_SECTION_1 = [
  'Comfort and orientation in LHS', 'Cockpit setup', 'Engine Start Process', 'Correct Use of Checklist',
  'Overall Aircraft Handling', 'Proficiency Check Test Specific Activities and Maneuvers',
];
const PRELIM_SECTION_2 = [
  'Shows awareness of crew roles and responsibilities', 'Demonstrates a safety-first mindset',
  'Communicates intentions (even if not fluent)', 'Acknowledges when unsure and seeks clarification',
  'Receptive to feedback from trainer/FO',
];
const FINAL_SECTION_1 = [
  "Aircraft control and handling", "Adherence to SOP's and checklists", 'Decision making',
  'Recognition of stable approach criteria', 'Decision to land or go around',
];
const FINAL_SECTION_2 = [
  'Task prioritisation and workload management', 'Monitoring and cross-checking',
  'Adherence to company policies and regulations', 'Situational awareness and risk assessment',
  'Decision to take over from First Officer when necessary',
];
const FINAL_SECTION_3 = [
  'Communication with crew and ATC', 'Leadership and command presence', 'Crew coordination and delegation',
  'Use of standard phraseology and briefing quality', 'Recognition and mitigation of operational threats',
  'Fatigue and stress management', 'Handling of unexpected or abnormal situations',
  'Decision making under pressure', 'Assertiveness and intervention when required',
];

function citSectionsFor(variant) {
  return variant === 'PRELIMINARY'
    ? [{ title: 'Section 1: Basic Aircraft Handling — LHS Introduction', kind: 'observation', items: PRELIM_SECTION_1 },
      { title: 'Section 2: Early Command Aptitude Indicators', kind: 'yesno', items: PRELIM_SECTION_2 }]
    : [{ title: 'Section 1: Flight Performance & Handling', kind: 'satisfactory', items: FINAL_SECTION_1 },
      { title: 'Section 2: Flight Management & Situational Awareness', kind: 'satisfactory', items: FINAL_SECTION_2 },
      { title: 'Section 3: Human Factors & Non-Technical Skills', kind: 'satisfactory', items: FINAL_SECTION_3 }];
}

export function buildCaptainInTrainingHtml(check, variant, crewMemberName) {
  const d = check.details || {};
  const items = d.items || {};
  const label = CIT_VARIANT_LABELS[variant];
  const sections = citSectionsFor(variant);
  let body = `<h1>${label}</h1><div class="meta">${crewMemberName} · ${d.date ? formatDate(d.date) : ''}</div>`;
  for (const s of sections) {
    body += section(s.title, s.items.map((desc) => {
      const v = items[desc] || {};
      const mark = s.kind === 'satisfactory' ? (v.satisfactory === true ? 'Satisfactory' : v.satisfactory === false ? 'Unsatisfactory' : '')
        : s.kind === 'yesno' ? (v.observation === true ? 'Yes' : v.observation === false ? 'No' : '')
          : `${v.observation || ''}${v.minStandard !== undefined ? ` (Min standard: ${v.minStandard ? 'Yes' : 'No'})` : ''}`;
      return [desc, `${mark}${v.comments ? ` — ${v.comments}` : ''}`];
    }));
  }
  body += section('Overall Assessment', [
    ['Final Recommendation', d.recommendation || ''],
    ['Assessor Comments', d.assessorComments || ''],
    ['Overall assessment', resultBadge(check.result)],
  ]);
  body += signatureBlock([['Assessor signature', d.assessorSig], ['Candidate signature', d.candidateSig]]);
  return body;
}

// ---- Initial Take-Off & Landing Assessment (LandingAssessmentForm.jsx) ----
const OBSERVATION_COUNT = 4;
const DEMONSTRATION_COUNT = 6;
function padded(list, count) {
  const arr = Array.isArray(list) ? list : [];
  return Array.from({ length: count }, (_, i) => arr[i] || {});
}

// `form` is the raw GET /api/landing-assessment/:traineeId response's `.form`.
export function buildLandingAssessmentHtml(form) {
  let body = '<h1>Initial Take-Off & Landing Assessment</h1>';
  body += `<div class="meta">Completed ${form.completedAt ? formatDate(form.completedAt) : '—'} · ${form.assignedToName ? `${form.assignedToRole ? formatUserRole(form.assignedToRole) : 'Assigned to'} ${form.assignedToName}${form.assignedToArn ? ` (ARN ${form.assignedToArn})` : ''}` : 'Unassigned'}</div>`;
  padded(form.observationSectors, OBSERVATION_COUNT).forEach((s, i) => {
    body += section(`Observation - Sector ${i + 1}`, [['Date', s.date ? formatDate(s.date) : ''], ['Route', s.route]]);
  });
  padded(form.demonstrationSectors, DEMONSTRATION_COUNT).forEach((s, i) => {
    body += section(`Demonstration - Flight ${i + 1}`, [
      ['Date', s.date ? formatDate(s.date) : ''], ['Airport', s.airport], ['Rwy', s.rwy], ['Wind', s.wind],
      ['Take-Off', s.takeOff === 'X' ? 'Take over required' : s.takeOff === 'S' ? 'Satisfactory' : ''],
      ['Land', s.land === 'X' ? 'Take over required' : s.land === 'S' ? 'Satisfactory' : ''],
      ['Competent', s.competent === 'YES' ? 'Yes' : s.competent === 'NO' ? 'No' : ''],
    ]);
  });
  body += section('Comments / Observations', [['Comments', form.comments]]);
  body += section('Release', [
    ['Exempt', form.exempt ? 'Yes' : 'No'],
    ['HOTC/HOFO signature', form.hotcHofoSignature],
    ['Release date', form.releaseDate],
  ]);
  body += signatureBlock([['Sign to release Candidate to normal LOFT (Check Captain)', form.releaseSignature]]);
  return body;
}

// ---- Upgrade Record (UpgradeRecordForm.jsx) ----
const UPGRADE_FLIGHT_STAGES = [
  { key: 'OBSERVATION', label: 'Observation' },
  { key: 'TRAINING', label: 'Training' },
];
const TRAINING_CAPTAIN_RECOMMENDATION_TEXT = [
  'Following satisfactory completion of the required supervised line training sectors with a Check Captain, the candidate may be approved as a Training Captain. This approval is conditional and does not permit the conduct of LOFT or other training duties in an unsupervised capacity.',
  "I certify that the above-named candidate has satisfactorily completed the required supervised line training sectors in accordance with company requirements. I further confirm that the candidate has demonstrated a satisfactory standard of knowledge, instructional technique, and operational competency appropriate to the role of Training Captain. I recommend the candidate for a Flight Examiner observation during LOFT sectors for the purpose of final assessment and authorisation to conduct LOFT and other training duties in an unsupervised capacity.",
];

function upgradeTickTableRows(allItems, savedItems) {
  const rows = [];
  let lastSection = null;
  for (const item of visibleCheckFormItems(allItems, savedItems)) {
    if (item.section && item.section !== lastSection) rows.push({ header: item.section });
    lastSection = item.section || lastSection;
    rows.push({ description: item.description, tick: savedItems[item.id]?.tick ? '✓' : '' });
  }
  return rows;
}

function upgradeFlightSection(f, i, stage) {
  let extra = '';
  if (f.topic) extra += `<div style="padding:6px 10px 0;font-size:11px;"><b>Topic:</b> ${f.topic}</div>`;
  if (f.comments) extra += `<div style="padding:6px 10px 0;font-size:11px;"><b>Comments:</b> ${f.comments}</div>`;
  if (stage.key === 'TRAINING' && f.areasOfImprovement) extra += `<div style="padding:6px 10px 0;font-size:11px;"><b>Areas of improvement:</b> ${f.areasOfImprovement}</div>`;
  if (stage.key === 'TRAINING' && f.nextSortie) extra += `<div style="padding:6px 10px 6px;font-size:11px;"><b>Next sortie:</b> ${f.nextSortie}</div>`;
  return `<div class="form-section">
    <h2>Flight ${i + 1}${f.date ? ` — ${formatDate(f.date)}` : ''}</h2>
    ${fieldGrid([['Trainer', f.trainerName || ''], ['Route', f.route], ['Method', f.method === 'AIRCRAFT' ? 'Aircraft' : f.method === 'SIMULATOR' ? 'Simulator' : ''], ['Airborne time', f.airborneTime]])}
    ${extra}
  </div>`;
}

// context: { label, crewMemberName, fleet (formatted string, already resolved), variant, allBriefingItems, allSimulatorItems, personnelCheck }
export function buildUpgradeRecordHtml(check, context) {
  const { label, crewMemberName, fleetLabel, variant, allBriefingItems, allSimulatorItems, personnelCheck } = context;
  const d = check.details || {};
  const items = d.briefingItems || {};
  let body = formTitleRow(label);
  body += fieldGrid([
    ['Candidate', crewMemberName],
    ['Aircraft Type', fleetLabel || ''],
    ['Date', d.date ? formatDate(d.date) : ''],
    ['Assessor', check.assignedToName ? `${check.assignedToRole ? formatUserRole(check.assignedToRole) : ''} ${check.assignedToName}`.trim() : ''],
  ]);
  body += tickTable(upgradeTickTableRows(allBriefingItems, items));
  if (d.briefingComments) body += `<div style="padding:6px 10px;font-size:11px;"><b>Comments:</b> ${d.briefingComments}</div>`;

  if (variant === 'TRAINING_CAPTAIN') {
    const simItems = d.simulatorItems || {};
    body += `<div class="page-break"></div>`;
    body += formTitleRow(`${label} (continued) — Simulator Training`);
    body += tickTable(upgradeTickTableRows(allSimulatorItems || [], simItems));
    if (d.simulatorOtherTraining) body += `<div style="padding:6px 10px;font-size:11px;"><b>Optional simulator training:</b> ${d.simulatorOtherTraining}</div>`;
  }

  for (const stage of UPGRADE_FLIGHT_STAGES) {
    const rows = (d.flights || []).filter((f) => f.stage === stage.key);
    if (rows.length === 0) continue;
    body += `<div class="page-break"></div>`;
    body += formTitleRow(`${label} (continued) — ${stage.label}`);
    body += rows.map((f, i) => upgradeFlightSection(f, i, stage)).join('');
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
  return body;
}

// ---- Ground Instructor Competency Check (GroundInstructorCheckForm.jsx) ----
export function buildGroundInstructorCheckHtml(check, items, userName) {
  let body = '<h1>Flight Standards Personnel (Ground) Competency Check</h1>';
  body += `<div class="meta">Applicant (Instructor): ${userName} · Completed ${check.completedAt ? formatDate(check.completedAt) : '—'}</div>`;
  body += section('Details', [
    ['Course Title', check.courseTitle],
    ['Date of Observation', check.dateOfObservation ? formatDate(check.dateOfObservation) : ''],
    ['Name of Assessor', check.assessorName],
  ]);
  body += section('Items', visibleCheckFormItems(items, check.items).map((item) => [
    item.description,
    check.items?.[item.id] === true ? 'Yes' : check.items?.[item.id] === false ? 'No' : '',
  ]));
  body += signatureBlock([
    [`Assessor${check.assessorPrintedName ? ` - ${check.assessorPrintedName}` : ''}`, check.assessorSignature],
    [`Instructor${check.instructorPrintedName ? ` - ${check.instructorPrintedName}` : ''}`, check.instructorSignature],
  ]);
  return body;
}

// ---- Personnel (Air) Competency Check (PersonnelCompetencyCheckForm.jsx) ----
export const SECTION_LABELS = {
  TRAINING_PILOT: '2a — Training Pilot',
  CHECK_PILOT: '2b — Check Pilot',
  TRAINING_CABIN_CREW: '3a — Training Cabin Crew',
  CHECK_CABIN_CREW: '3b — Check Cabin Crew',
};
const PAC_SECTION_PRIORITY = { PREFLIGHT: 0, DEBRIEF: 2 };
function pacRelevantItems(items, candidateSection) {
  return items
    .filter((i) => i.section === 'PREFLIGHT' || i.section === candidateSection || i.section === 'DEBRIEF')
    .sort((a, b) => (PAC_SECTION_PRIORITY[a.section] ?? 1) - (PAC_SECTION_PRIORITY[b.section] ?? 1) || a.sortOrder - b.sortOrder);
}
function pacExpiryDate(checkDate) {
  if (!checkDate) return null;
  const d = new Date(checkDate);
  d.setMonth(d.getMonth() + 24);
  return d.toISOString().slice(0, 10);
}

export function buildPersonnelCompetencyCheckHtml(check, items, userName) {
  const relevant = visibleCheckFormItems(pacRelevantItems(items, check.candidateSection), check.items);
  const preflight = relevant.filter((i) => i.section === 'PREFLIGHT');
  const subsection = relevant.filter((i) => i.section === check.candidateSection);
  const debrief = relevant.filter((i) => i.section === 'DEBRIEF');
  const rowFor = (item) => [item.description, check.items?.[item.id] || ''];

  let body = '<h1>Flight Standards Personnel (Air) Competency Check</h1>';
  body += `<div class="meta">Candidate: ${userName} · ${SECTION_LABELS[check.candidateSection] || ''} · Completed ${check.completedAt ? formatDate(check.completedAt) : '—'}</div>`;
  body += section('Details', [
    ['Training / Check Type', check.trainingCheckType],
    ['Date', check.checkDate ? formatDate(check.checkDate) : ''],
    ['Assessor', check.assessorName],
    ['Expiry (24m)', check.checkDate ? formatDate(pacExpiryDate(check.checkDate)) : ''],
    ['Aircraft Type', check.aircraftType],
  ]);
  body += section('Section 1 — Preflight Examination', preflight.map(rowFor));
  body += section(SECTION_LABELS[check.candidateSection] || 'Section', subsection.map(rowFor));
  body += section('Section 4 — Debrief', debrief.map(rowFor));
  body += section('Comments', [['Comments', check.comments], ['Recommendations', check.recommendations]]);
  body += `<div style="font-size:12px;font-style:italic;margin:0.75rem 0;">I certify that the purpose of this assessment as specified in E.6.16 has been achieved.</div>`;
  body += signatureBlock([['Assessor', check.certifiedSignature]]);
  return body;
}

// ---- LOFT flight record (ArchivedFlights.jsx) ----
export function buildLoftFlightHtml(f) {
  const isCa = f.traineeType === 'CABIN_ATTENDANT';
  const sector = f.sectorDetails || {};
  return `
    <h1>LOFT Flight Record</h1>
    <div class="meta">${f.firstName} ${f.lastName} · ${formatDate(f.date)}${!isCa ? ` · ${Number(f.hours)}h` : ''}</div>
    ${section('Flight details', isCa
      ? [['Position', sector.position], ['Aircraft', sector.aircraft], ['Destination', sector.destination]]
      : [['Route', sector.route], ['Approaches flown', (sector.approaches || []).map((a) => a.type).filter(Boolean).join(', ') || '—']])}
    ${section('Debrief', isCa
      ? [['Other completed tasks', f.otherCompletedTasks], ['Development required', f.debriefComments], ['Homework', f.nextSortieNotes]]
      : [['Flight comments', f.debriefComments], ['LOFT performance rating', f.loftPerformanceRating], ['Next sortie', f.nextSortieNotes]])}
    ${section('Sign-off', [
      [f.trainingCaptainRole ? formatUserRole(f.trainingCaptainRole) : 'Trainer', f.trainingCaptainName],
      ['Acknowledged by trainee', f.acknowledgedByTrainee ? `Yes${f.acknowledgedAt ? ` (${formatDate(f.acknowledgedAt)})` : ''}` : 'No'],
    ])}
    <div class="disclaimer">We, the undersigned, do hereby mutually agree upon and accept the comment written in this document as being a correct and honest account of the performance of the Applicant in each and every procedure carried out.</div>
    ${signatureBlock([['Assessor signature', f.assessorSignature], ['Candidate signature', f.candidateSignature]])}
  `;
}

// ---- Crew file "homepage" summary (new - see CrewDetail.jsx printCrewFile) ----
// Mirrors CrewDetail.jsx's ExpiryTab: the recurrent-check currency snapshot
// (EP/IPC/PC/Line Check) plus the ad-hoc competency list (Medical etc,
// GET /api/crew/:id/competencies) - a plain print-styled readout of the same
// data, not the interactive DueBadge/CompetencyRow components.
const CURRENCY_STATUS_LABELS = {
  ok: 'Current', due_soon: 'Due soon', overdue: 'Overdue', not_completed: 'Not yet completed', in_training: 'In training',
};

// member.currency.X is already status-computed server-side (see
// backend/src/routes/crew.js withCurrency, and DueBadge.jsx which reads
// info.status directly) - grace periods, new-hire suppression and the
// "in_training" ground-school gate all live there, so this must read that
// field rather than re-deriving a status from the due date alone.
function currencyLabel(info) {
  if (!info) return '';
  if (!info.dueDate) return info.status === 'in_training' ? 'Ground school not yet complete' : 'Not yet current';
  return `${CURRENCY_STATUS_LABELS[info.status] || info.status}${info.dueDate ? ` (due ${formatDate(info.dueDate)})` : ''}`;
}

// The ad-hoc competency list (Medical etc, from GET /api/crew/:id/competencies)
// has no server-computed status field of its own - CrewDetail.jsx classifies
// these client-side from the plain due date via competencyStatus, so this
// mirrors that rather than currencyLabel above.
function competencyLabel(c) {
  if (c.na) return 'Not applicable';
  const status = competencyStatus(c.dueDate);
  return `${CURRENCY_STATUS_LABELS[status] || status}${c.dueDate ? ` (due ${formatDate(c.dueDate)})` : ''}`;
}

export function buildCrewFileSummary(member, competencies) {
  const isPilot = member.type === 'PILOT';
  const currencyRows = [
    ['Emergency Procedures', currencyLabel(member.currency?.emergencyProcedures)],
    ...(isPilot ? [['IPC', currencyLabel(member.currency?.ipc)]] : []),
    ...(isPilot ? [['Proficiency Check', currencyLabel(member.currency?.proficiencyCheck)]] : []),
    ['Line Check', currencyLabel(member.currency?.lineCheck)],
  ];
  const competencyRows = competencies.map((c) => [c.name, competencyLabel(c)]);
  return `
    <h1>Personnel File</h1>
    <div class="meta">${member.name} · ${member.type === 'PILOT' ? 'Pilot' : 'Cabin Attendant'} · ARN ${member.arn || '—'}</div>
    ${section('Recurrent check currency', currencyRows)}
    ${section('Competencies', competencyRows)}
  `;
}
