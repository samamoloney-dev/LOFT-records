// Assembles one combined, page-broken printable document for a crew
// member's whole file - a currency/competency summary followed by their
// most recent record of every check type that applies to them, including
// pre-qualification LOFT training paperwork (Check to Line, Landing
// Assessment, most recent LOFT flight - only present if this crew profile
// is still linked back to the trainee record it was created from) and, if
// they're also linked to an FS Staff account, that account's own
// instructor/examiner competency checks. See CrewDetail.jsx's "Print file"
// button (HOTC/HOFO/Flight Ops Admin only).
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

// A crew member's own history for a given check type is filtered to just
// the completed/archived ones (matching exactly what each form's own
// PrintButton is already gated on: `archived || completedAt` - an
// in-progress record has no signatures/result yet and isn't meaningful in a
// personnel file), then the most recently completed one wins.
function mostRecentCheck(checks) {
  const printable = (checks || []).filter((c) => c.completedAt || c.archived);
  if (printable.length === 0) return null;
  return printable.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0))[0];
}

// Every fetch here is best-effort - a missing/erroring endpoint (e.g. no
// Check to Line ever started for this trainee) just means that section is
// skipped, not that the whole file fails to print.
async function safeGet(url) {
  try { return await api.get(url); } catch { return null; }
}

export async function printCrewFile(member, competencies) {
  const isPilot = member.type === 'PILOT';
  const fleet = member.fleets?.length === 1 ? member.fleets[0] : undefined;
  const sections = [];

  const [epChecks, epItems] = await Promise.all([
    safeGet(`/api/checks?checkType=EMERGENCY_PROCEDURES&crewMemberId=${member.id}`),
    safeGet('/api/check-form-items?formKey=EMERGENCY_PROCEDURES&includeArchived=true'),
  ]);
  const epCheck = mostRecentCheck(epChecks);
  if (epCheck) sections.push(buildEpCheckHtml(epCheck, epItems || []));

  if (isPilot) {
    const [ipcPcChecks, pcItems] = await Promise.all([
      safeGet(`/api/checks?checkType=RECURRENT_SIMULATOR&crewMemberId=${member.id}`),
      safeGet('/api/check-form-items?formKey=PROFICIENCY_CHECK&includeArchived=true'),
    ]);
    const ipcCheck = mostRecentCheck((ipcPcChecks || []).filter((c) => c.details?.variant === 'IPC_PC'));
    const pcCheck = mostRecentCheck((ipcPcChecks || []).filter((c) => c.details?.variant === 'PC'));
    if (ipcCheck) sections.push(buildProficiencyCheckHtml(ipcCheck, pcItems || []));
    if (pcCheck) sections.push(buildProficiencyCheckHtml(pcCheck, pcItems || []));

    const [lineChecks, lineItems] = await Promise.all([
      safeGet(`/api/checks?checkType=PILOT_LINE_CHECK&crewMemberId=${member.id}`),
      safeGet(`/api/check-form-items?formKey=PILOT_LINE_CHECK${fleet ? `&fleet=${fleet}` : ''}&includeArchived=true`),
    ]);
    const lineCheck = mostRecentCheck(lineChecks);
    if (lineCheck) {
      const refresherCompetency = (competencies || []).find((c) => c.name === 'Refresher Training') || null;
      sections.push(buildPilotLineCheckHtml(lineCheck, lineItems || [], refresherCompetency, member.name));
    }

    if (member.captainInTraining) {
      const citChecks = await safeGet(`/api/checks?checkType=CAPTAIN_IN_TRAINING&crewMemberId=${member.id}`);
      const prelim = mostRecentCheck((citChecks || []).filter((c) => c.details?.variant === 'PRELIMINARY'));
      const final = mostRecentCheck((citChecks || []).filter((c) => c.details?.variant === 'FINAL'));
      if (prelim) sections.push(buildCaptainInTrainingHtml(prelim, 'PRELIMINARY', member.name));
      if (final) sections.push(buildCaptainInTrainingHtml(final, 'FINAL', member.name));
    }
  } else {
    const [caChecks, caAllItems] = await Promise.all([
      safeGet(`/api/checks?checkType=CABIN_ATTENDANT_LINE_CHECK&crewMemberId=${member.id}`),
      safeGet('/api/check-form-items?formKey=CABIN_ATTENDANT_LINE_CHECK&includeArchived=true'),
    ]);
    const caCheck = mostRecentCheck(caChecks);
    if (caCheck) {
      const caItems = (caAllItems || []).filter((i) => i.kind === 'tick');
      const ntsMarkers = (caAllItems || []).filter((i) => i.kind === 'score_code');
      sections.push(buildCaLineCheckHtml(caCheck, caItems, ntsMarkers));
    }
  }

  // Only one active Upgrade Record ever exists per candidate (see
  // UpgradeRecordForm.jsx) - variant isn't known ahead of time, so its own
  // item catalogue(s) and any linked Personnel Competency Check are fetched
  // only once the record (and its variant) is in hand.
  const upgradeChecks = await safeGet(`/api/checks?checkType=UPGRADE_RECORD&crewMemberId=${member.id}`);
  const upgradeCheck = mostRecentCheck(upgradeChecks);
  if (upgradeCheck) {
    const variant = upgradeCheck.details?.variant;
    const variantConfig = UPGRADE_VARIANTS[variant];
    const [allBriefingItems, allSimulatorItems, personnelCheck] = await Promise.all([
      safeGet(`/api/check-form-items?formKey=UPGRADE_${variant}&includeArchived=true`),
      variant === 'TRAINING_CAPTAIN' ? safeGet('/api/check-form-items?formKey=UPGRADE_TRAINING_CAPTAIN_SIMULATOR&includeArchived=true') : Promise.resolve([]),
      upgradeCheck.details?.personnelCheckId ? safeGet(`/api/personnel-checks/${upgradeCheck.details.personnelCheckId}`) : Promise.resolve(null),
    ]);
    sections.push(buildUpgradeRecordHtml(upgradeCheck, {
      label: variantConfig?.label || 'Upgrade Record',
      crewMemberName: member.name,
      fleetLabel: fleet,
      variant,
      allBriefingItems: allBriefingItems || [],
      allSimulatorItems: allSimulatorItems || [],
      personnelCheck,
    }));
  }

  // Pre-qualification LOFT training paperwork - only reachable via
  // crew_members.trainee_id (see backend/src/routes/crew.js), which stops
  // existing once a trainee record is deleted, not just archived.
  if (member.traineeId) {
    const [ctlData, landingData, flights] = await Promise.all([
      safeGet(`/api/ctl/${member.traineeId}`),
      safeGet(`/api/landing-assessment/${member.traineeId}`),
      safeGet(`/api/flights?traineeId=${member.traineeId}&archived=true`),
    ]);
    if (ctlData?.form && (ctlData.form.completedAt || ctlData.form.archived)) sections.push(buildCtlFormHtml(ctlData, member.type));
    if (landingData?.form && (landingData.form.completedAt || landingData.form.archived)) sections.push(buildLandingAssessmentHtml(landingData.form));
    if (flights && flights.length > 0) {
      const mostRecentFlight = [...flights].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      sections.push(buildLoftFlightHtml(mostRecentFlight));
    }
  }

  // The linked FS Staff account's own instructor/examiner competency
  // checks - this is that account's own qualification record, separate
  // from everything above (which is this person's record as a crew
  // member/candidate).
  if (member.isLinked) {
    const [gicChecks, gicItems, pacChecks, pacItems] = await Promise.all([
      safeGet(`/api/instructor-checks?userId=${member.userId}`),
      safeGet('/api/check-form-items?formKey=GROUND_INSTRUCTOR_COMPETENCY&includeArchived=true'),
      safeGet(`/api/personnel-checks?userId=${member.userId}`),
      safeGet('/api/check-form-items?formKey=PERSONNEL_AIR_COMPETENCY&includeArchived=true'),
    ]);
    const gicCheck = mostRecentCheck(gicChecks);
    if (gicCheck) sections.push(buildGroundInstructorCheckHtml(gicCheck, gicItems || [], member.name));
    const pacCheck = mostRecentCheck(pacChecks);
    if (pacCheck) sections.push(buildPersonnelCompetencyCheckHtml(pacCheck, pacItems || [], member.name));
  }

  const body = [buildCrewFileSummary(member, competencies || []), ...sections].join('<div class="page-break"></div>');
  openPrintWindow(`Personnel File - ${member.name}`, body);
}
