// Assembles one combined, page-broken printable document for a crew
// member's whole file - a currency/competency summary followed by their
// full history (at least the past 72 months) of every check type that
// applies to them, including every pre-qualification LOFT training period
// they've ever been through (initial onboarding, and any later
// FO-to-Captain upgrade or fleet conversion - see crew.js's
// loftTraineeIds) and, if they're also linked to an FS Staff account, that
// account's own instructor/examiner competency check history too. See
// CrewDetail.jsx's "Print file" button (HOTC/HOFO/Flight Ops Admin only).
//
// Each section reuses the exact same builder its own individual Print
// button calls (see lib/printBuilders.js) - just fed with independently
// fetched data instead of needing that check form's own component mounted.
import { api } from '../api/client';
import { openPrintWindow } from './print';
import { UPGRADE_VARIANTS } from './roles';
import {
  buildCrewFileSummary, buildEpCheckHtml, buildCaLineCheckHtml, buildProficiencyCheckHtml,
  buildPilotLineCheckHtml, buildCtlFormHtml, buildCaptainInTrainingHtml, buildLandingAssessmentHtml,
  buildUpgradeRecordHtml, buildGroundInstructorCheckHtml, buildPersonnelCompetencyCheckHtml, buildLoftFlightHtml,
} from './printBuilders';

// Per the operator's explicit request: a personnel file/audit handover
// needs a working career's worth of history, not just the current record -
// "at least" 72 months, so nothing this recent is ever left out regardless
// of how far back this operator's own data actually goes.
const HISTORY_MONTHS = 72;

// Every fetch here is best-effort - a missing/erroring endpoint (e.g. no
// Check to Line ever started for this trainee) just means that section is
// skipped, not that the whole file fails to print.
async function safeGet(url) {
  try { return await api.get(url); } catch { return null; }
}

// GET /api/checks only ever returns one archived state per call (see
// checks.js) - a personnel file needs both, since a superseded (archived)
// check is exactly the kind of history this feature exists to show, not
// something to hide.
async function fetchAllChecks(checkType, crewMemberId) {
  const [active, archived] = await Promise.all([
    safeGet(`/api/checks?checkType=${checkType}&crewMemberId=${crewMemberId}`),
    safeGet(`/api/checks?checkType=${checkType}&crewMemberId=${crewMemberId}&archived=true`),
  ]);
  return [...(active || []), ...(archived || [])];
}

// instructor-checks.js/personnel-checks.js's own archived=true browse is
// global (admin-only, every instructor/candidate at once) rather than
// scoped by userId like checks.js - filtered down to this one user here
// instead.
async function fetchAllUserChecks(basePath, userId) {
  const [active, archived] = await Promise.all([
    safeGet(`${basePath}?userId=${userId}`),
    safeGet(`${basePath}?archived=true`),
  ]);
  return [...(active || []), ...(archived || []).filter((c) => c.userId === userId)];
}

// Every completed check within the lookback window, most recent first -
// matches each form's own PrintButton gating (completedAt is what actually
// makes a record meaningful to print; an abandoned in-progress one isn't).
function historicalChecks(checks, months = HISTORY_MONTHS) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return (checks || [])
    .filter((c) => c.completedAt && new Date(c.completedAt) >= cutoff)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

export async function printCrewFile(member, competencies) {
  const isPilot = member.type === 'PILOT';
  const fleet = member.fleets?.length === 1 ? member.fleets[0] : undefined;
  const sections = [];

  const [epChecks, epItems] = await Promise.all([
    fetchAllChecks('EMERGENCY_PROCEDURES', member.id),
    safeGet('/api/check-form-items?formKey=EMERGENCY_PROCEDURES&includeArchived=true'),
  ]);
  for (const chk of historicalChecks(epChecks)) sections.push(buildEpCheckHtml(chk, epItems || []));

  if (isPilot) {
    const [ipcPcChecks, pcItems] = await Promise.all([
      fetchAllChecks('RECURRENT_SIMULATOR', member.id),
      safeGet('/api/check-form-items?formKey=PROFICIENCY_CHECK&includeArchived=true'),
    ]);
    const ipcHistory = historicalChecks((ipcPcChecks || []).filter((c) => c.details?.variant === 'IPC_PC'));
    const pcHistory = historicalChecks((ipcPcChecks || []).filter((c) => c.details?.variant === 'PC'));
    for (const chk of ipcHistory) sections.push(buildProficiencyCheckHtml(chk, pcItems || []));
    for (const chk of pcHistory) sections.push(buildProficiencyCheckHtml(chk, pcItems || []));

    const [lineChecks, lineItems] = await Promise.all([
      fetchAllChecks('PILOT_LINE_CHECK', member.id),
      safeGet(`/api/check-form-items?formKey=PILOT_LINE_CHECK${fleet ? `&fleet=${fleet}` : ''}&includeArchived=true`),
    ]);
    const refresherCompetency = (competencies || []).find((c) => c.name === 'Refresher Training') || null;
    for (const chk of historicalChecks(lineChecks)) {
      sections.push(buildPilotLineCheckHtml(chk, lineItems || [], refresherCompetency, member.name));
    }

    // Captain in Training assessments stay visible in a Captain's file even
    // after they've since upgraded and captainInTraining was cleared - the
    // flag only gates who can currently *start* one (CaptainInTrainingForm.jsx),
    // not whether a past one belongs in their history.
    const [citChecks, prelimItems, finalItems] = await Promise.all([
      fetchAllChecks('CAPTAIN_IN_TRAINING', member.id),
      safeGet('/api/check-form-items?formKey=CAPTAIN_IN_TRAINING_PRELIMINARY&includeArchived=true'),
      safeGet('/api/check-form-items?formKey=CAPTAIN_IN_TRAINING_FINAL&includeArchived=true'),
    ]);
    const prelimHistory = historicalChecks((citChecks || []).filter((c) => c.details?.variant === 'PRELIMINARY'));
    const finalHistory = historicalChecks((citChecks || []).filter((c) => c.details?.variant === 'FINAL'));
    for (const chk of prelimHistory) sections.push(buildCaptainInTrainingHtml(chk, 'PRELIMINARY', prelimItems || [], member.name));
    for (const chk of finalHistory) sections.push(buildCaptainInTrainingHtml(chk, 'FINAL', finalItems || [], member.name));
  } else {
    const [caChecks, caAllItems] = await Promise.all([
      fetchAllChecks('CABIN_ATTENDANT_LINE_CHECK', member.id),
      safeGet('/api/check-form-items?formKey=CABIN_ATTENDANT_LINE_CHECK&includeArchived=true'),
    ]);
    const caItems = (caAllItems || []).filter((i) => i.kind === 'tick');
    const ntsMarkers = (caAllItems || []).filter((i) => i.kind === 'score_code');
    for (const chk of historicalChecks(caChecks)) sections.push(buildCaLineCheckHtml(chk, caItems, ntsMarkers));
  }

  // Upgrade Records: grouped by variant (Training Captain/Check Captain/
  // Training Cabin Attendant/Check Cabin Attendant - see UPGRADE_VARIANTS),
  // each with its own item catalogue and formKey - a career can carry more
  // than one over time (e.g. Training Captain first, Check Captain later),
  // and every FO-to-Captain upgrade candidate's history needs to survive
  // here even once they've since moved on to Check Captain or beyond.
  const upgradeChecks = await fetchAllChecks('UPGRADE_RECORD', member.id);
  const variantsPresent = [...new Set((upgradeChecks || []).map((c) => c.details?.variant).filter(Boolean))];
  for (const variant of variantsPresent) {
    const variantConfig = UPGRADE_VARIANTS[variant];
    const [allBriefingItems, allSimulatorItems] = await Promise.all([
      safeGet(`/api/check-form-items?formKey=UPGRADE_${variant}&includeArchived=true`),
      variant === 'TRAINING_CAPTAIN' ? safeGet('/api/check-form-items?formKey=UPGRADE_TRAINING_CAPTAIN_SIMULATOR&includeArchived=true') : Promise.resolve([]),
    ]);
    const history = historicalChecks(upgradeChecks.filter((c) => c.details?.variant === variant));
    for (const chk of history) {
      // eslint-disable-next-line no-await-in-loop
      const personnelCheck = chk.details?.personnelCheckId ? await safeGet(`/api/personnel-checks/${chk.details.personnelCheckId}`) : null;
      sections.push(buildUpgradeRecordHtml(chk, {
        label: variantConfig?.label || 'Upgrade Record',
        crewMemberName: member.name,
        fleetLabel: fleet,
        variant,
        allBriefingItems: allBriefingItems || [],
        allSimulatorItems: allSimulatorItems || [],
        personnelCheck,
      }));
    }
  }

  // Pre-qualification LOFT training paperwork - every trainee record this
  // crew member has ever been linked to (direct link, or reverse-linked via
  // an upgrade/fleet-conversion - see crew.js's loftTraineeIds), not just
  // the most recent, so a multi-cycle career (initial onboarding, then a
  // later FO-to-Captain upgrade or fleet conversion) gets all of them
  // attached, each with its own Check to Line/Landing Assessment/flights.
  const [loftFirstName, ...loftRest] = member.name.split(' ');
  const loftLastName = loftRest.join(' ');
  for (const traineeId of member.loftTraineeIds || []) {
    // eslint-disable-next-line no-await-in-loop
    const [ctlData, landingData, activeFlights, archivedFlights] = await Promise.all([
      safeGet(`/api/ctl/${traineeId}`),
      safeGet(`/api/landing-assessment/${traineeId}`),
      safeGet(`/api/flights?traineeId=${traineeId}`),
      safeGet(`/api/flights?traineeId=${traineeId}&archived=true`),
    ]);
    if (ctlData?.form && (ctlData.form.completedAt || ctlData.form.archived)) sections.push(buildCtlFormHtml(ctlData, member.type));
    if (landingData?.form && (landingData.form.completedAt || landingData.form.archived)) sections.push(buildLandingAssessmentHtml(landingData.form));
    // GET /api/flights?traineeId=X (unlike the cross-trainee archive
    // browse ArchivedFlights.jsx uses) doesn't join in firstName/lastName/
    // traineeType - buildLoftFlightHtml needs those for its meta line and
    // CA/pilot branching, so they're filled in from the crew member here.
    // Draft (unlocked, never finalised) flights are excluded - nothing
    // signed off yet isn't a meaningful personnel record.
    const flights = [...(activeFlights || []), ...(archivedFlights || [])]
      .filter((f) => f.locked)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const flight of flights) {
      sections.push(buildLoftFlightHtml({ ...flight, firstName: loftFirstName, lastName: loftLastName, traineeType: member.type }));
    }
  }

  // The linked FS Staff account's own instructor/examiner competency
  // check history - this is that account's own qualification record,
  // separate from everything above (which is this person's record as a
  // crew member/candidate).
  if (member.isLinked) {
    const [gicChecks, gicItems, pacChecks, pacItems] = await Promise.all([
      fetchAllUserChecks('/api/instructor-checks', member.userId),
      safeGet('/api/check-form-items?formKey=GROUND_INSTRUCTOR_COMPETENCY&includeArchived=true'),
      fetchAllUserChecks('/api/personnel-checks', member.userId),
      safeGet('/api/check-form-items?formKey=PERSONNEL_AIR_COMPETENCY&includeArchived=true'),
    ]);
    for (const chk of historicalChecks(gicChecks)) sections.push(buildGroundInstructorCheckHtml(chk, gicItems || [], member.name));
    for (const chk of historicalChecks(pacChecks)) sections.push(buildPersonnelCompetencyCheckHtml(chk, pacItems || [], member.name));
  }

  const body = [buildCrewFileSummary(member, competencies || []), ...sections].join('<div class="page-break"></div>');
  openPrintWindow(`Personnel File - ${member.name}`, body);
}
