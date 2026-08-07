const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole, isCaOnlyRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { resolveAssignee } = require('../lib/assignee');
const { nextDueRolling, pilotLineCheckDue, statusFor, competencyStatus, addDays, addMonths } = require('../lib/currency');
const { createCheckRecord } = require('./checks');
const { fleetOrderError } = require('../lib/fleetOrder');
const { PILOT_CLEARANCE_STAGES, CA_CLEARANCE_STAGES, isClearanceSigner } = require('../lib/clearance');

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

const router = express.Router();

// Crew (already-qualified line pilots/cabin attendants, tracked for
// recurrency) is a separate concept from trainees (people going through
// initial qualification) - see 0018 migration comment. Restricted to
// HOTC/HOFO/Flight Ops Admin for now, same as Staff/Archive - plus Cabin
// Attendant Manager, who is additionally let in but scoped to cabin
// attendant records only (see isCaOnlyRole checks below) and blocked
// entirely from the lifecycle/admin-only routes (create, archive/unarchive,
// delete, clearances, converting a planned check into a real one).
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES, 'CA_MANAGER'));

function blockCaManager(req, res, next) {
  if (req.user.role === 'CA_MANAGER') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// A Cabin Attendant Manager reaching this far (past the router-wide gate
// above) may only ever see/touch cabin attendant crew - never a pilot.
function forbiddenForCaManager(req, member) {
  return isCaOnlyRole(req.user) && member.type !== 'CABIN_ATTENDANT';
}

// Some crew members are also staff accounts (e.g. a Training Captain who is
// themselves subject to recurrent currency) - when crew_members.user_id
// links to one, their name is read live from the users table instead of
// the crew member's own (possibly stale) copy, so an amendment on the
// Staff page carries straight over without re-entry.
//
// fleets is deliberately NOT overlaid from the linked user: users.fleets is
// fleet *access* (which fleets a staff member administers/can be assigned
// checks for - HOTC/HOFO always have all of them), a different concept
// from a crew member's *personal* fleet (what aircraft they themselves fly
// and need checked on). Overlaying it used to clobber e.g. an HOTC's own
// crew profile fleet with "every fleet", leaving no way to tell which
// simulator form applied to them - see crew_members.fleets, set directly
// on this profile regardless of any staff link.
const CREW_SELECT = `
  SELECT crew_members.*, u.name AS linked_user_name, u.role AS linked_user_role, u.check_access AS linked_check_access
  FROM crew_members
  LEFT JOIN users u ON u.id = crew_members.user_id
`;

function serializeCrewMember(row) {
  const m = rowToCamel(row);
  const isLinked = !!m.userId;
  const { linkedUserName, linkedUserRole, linkedCheckAccess, ...rest } = m;
  return {
    ...rest,
    fleets: parsePgArray(rest.fleets),
    name: isLinked ? linkedUserName : `${rest.firstName} ${rest.lastName}`,
    isLinked,
    // The staff role this crew member is already linked to, if any - lets
    // callers (e.g. UpgradePicker.jsx) exclude candidates already senior to
    // a given upgrade tier (a Check Captain doesn't need a Training Captain
    // Upgrade form, etc).
    linkedRole: isLinked ? linkedUserRole : null,
    // Needed alongside linkedRole to decide Ground Instructor Check
    // eligibility (see lib/roles.js isGroundInstructorCheckEligible, which
    // checks EMERGENCY_PROCEDURES checkAccess as well as role) - surfaced
    // so the crew profile's own Specialist Training tab can apply the same
    // eligibility rule as the Staff page without a second fetch.
    linkedCheckAccess: isLinked ? parsePgArray(linkedCheckAccess) : null,
  };
}

async function findCrewMember(id) {
  const { rows } = await pool.query(`${CREW_SELECT} WHERE crew_members.id = $1`, [id]);
  return rows[0] ? serializeCrewMember(rows[0]) : null;
}

// Archived crew records must be retained unaltered - the only way back to
// an editable state is the dedicated unarchive route below, which is
// deliberately exempt from this guard.
function assertNotArchived(member, res) {
  if (member.archived) {
    res.status(403).json({ error: 'This crew member is archived - unarchive them first to make changes' });
    return false;
  }
  return true;
}

// Deliberately excludes archived checks. A completed check only ever gets
// archived one of two ways: auto-superseded the moment a newer one of the
// same type/variant completes (see checks.js PATCH /:id), or manually
// archived by an admin - either way, "archived" means "no longer the
// current record" everywhere else in this app (the Dates tab, the archive
// browse views, etc.), so this must honour that too. Omitting this filter
// was a real bug: any leftover archived check with a later completed_at
// than the genuinely-current one (e.g. stale seed/mock data left on a
// crew profile that was later repurposed for a real person) would
// silently win here and corrupt that crew member's due date - reported
// live for Garry Underwood (pilot), but this function is shared by both
// pilot and cabin attendant currency, so it was never pilot-only.
async function lastCompletedCheck(crewMemberId, checkType, variant) {
  const params = [crewMemberId, checkType];
  let variantClause = '';
  if (variant) {
    params.push(variant);
    variantClause = `AND details->>'variant' = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT completed_at FROM checks
     WHERE crew_member_id = $1 AND check_type = $2 ${variantClause} AND completed_at IS NOT NULL AND archived = false
     ORDER BY completed_at DESC LIMIT 1`,
    params,
  );
  return rows[0]?.completed_at || null;
}

// A planned check's own row (crew_planned_checks) is deleted the moment
// "Create check form" turns it into a real check (see the create-check
// route below) - so once that happens, dueInfo's plannedDate/
// plannedAssignedTo just go back to null with nothing to show for it. This
// tells dueInfo whether an active (non-archived), not-yet-completed check
// of this type already exists, so the UI can say "Check Form Issued"
// instead of the planned note just vanishing.
async function hasInProgressCheck(crewMemberId, checkType, variant) {
  const params = [crewMemberId, checkType];
  let variantClause = '';
  if (variant) {
    params.push(variant);
    variantClause = `AND details->>'variant' = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT 1 FROM checks
     WHERE crew_member_id = $1 AND check_type = $2 ${variantClause} AND completed_at IS NULL AND archived = false LIMIT 1`,
    params,
  );
  return rows.length > 0;
}

async function completedPilotLineCheckCount(crewMemberId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM checks
     WHERE crew_member_id = $1 AND check_type = 'PILOT_LINE_CHECK' AND completed_at IS NOT NULL`,
    [crewMemberId],
  );
  return rows[0]?.n || 0;
}

// A "new hire" crew profile is linked to its trainee record (see POST /
// newHire handling) so this can tell whether they've actually started -
// a trainee who hasn't finished ground school yet shouldn't be flagged
// overdue on EP/IPC/PC/Line Check just because they've never done one;
// they haven't been trained for it yet. NA'd items (see the Ground
// School First Aid toggle) don't count as outstanding.
async function hasIncompleteGroundSchool(traineeId) {
  if (!traineeId) return false;
  const { rows } = await pool.query(
    `SELECT gsi.id FROM trainees t
     JOIN ground_school_items gsi ON gsi.fleet = t.fleet AND gsi.syllabus_id IS NOT DISTINCT FROM t.syllabus_id
     LEFT JOIN ground_school_progress gsp ON gsp.ground_school_item_id = gsi.id AND gsp.trainee_id = t.id
     WHERE t.id = $1 AND gsi.required = true
       AND gsp.completed_at IS NULL AND COALESCE((gsp.details->>'na')::boolean, false) = false
     LIMIT 1`,
    [traineeId],
  );
  return rows.length > 0;
}

// Whether this crew member still has an active (non-archived) linked
// trainee record - i.e. genuinely still going through LOFT rather than
// just historically linked to one. See withCurrency's use of this: IPC,
// Line Check and Refresher Training don't apply yet while someone's still
// in LOFT, regardless of where ground school itself is up to (that only
// covers the earlier phase - see hasIncompleteGroundSchool above), so
// those shouldn't show as overdue just because they've never been done.
async function isInLoft(traineeId) {
  if (!traineeId) return false;
  const { rows } = await pool.query('SELECT archived FROM trainees WHERE id = $1', [traineeId]);
  return rows.length > 0 && !rows[0].archived;
}

// An existing crew member sent back to LOFT for an upgrade or fleet
// conversion (see trainees.js POST / - sourceCrewMemberId) gets a trainee
// record that points *at* them (trainees.source_crew_member_id) - the
// reverse of the usual crew_members.trainee_id link. That merge only
// happens once Check to Line completes (see trainees.js promote-to-crew),
// so until then this crew profile's own trainee_id stays whatever it
// already was (usually null) and the ground-school/in-LOFT gating below
// would otherwise be blind to the upgrade entirely - e.g. an FO's Line
// Check reading overdue while they're mid-Captain-upgrade in LOFT, since
// that Line Check is about to be superseded by their new Check to Line
// anyway. Reported live for Mathew Joubert (FO-to-Captain upgrade).
async function activeUpgradeTraineeId(crewMemberId) {
  const { rows } = await pool.query(
    'SELECT id FROM trainees WHERE source_crew_member_id = $1 AND archived = false ORDER BY created_at DESC LIMIT 1',
    [crewMemberId],
  );
  return rows[0]?.id || null;
}

// Same reverse link as activeUpgradeTraineeId, but not restricted to a
// still-in-progress record, and not just the single most recent one - a
// career can carry several of these (initial onboarding, an FO-to-Captain
// upgrade, a later fleet conversion), each pointing at its own trainee
// record, and none of them ever get backfilled onto
// crew_members.trainee_id (see the comment above) - so every one of their
// completed Check to Line/Landing Assessment/flights would otherwise be
// unreachable from this crew profile forever, not just the latest.
// Reported live for Mathew Joubert - his completed LOFT paperwork looked
// to have "vanished" once promote-to-crew archived the trainee record it
// lived under. Exposed to the frontend as loftTraineeIds below (most
// recent first); printCrewFile.js's Print file feature is the consumer -
// it needs the whole career's worth of LOFT paperwork, not just the
// latest cycle.
async function allLinkedTraineeIds(crewMemberId, directTraineeId) {
  const { rows } = await pool.query(
    'SELECT id FROM trainees WHERE source_crew_member_id = $1 ORDER BY created_at DESC',
    [crewMemberId],
  );
  const ids = rows.map((r) => r.id);
  if (directTraineeId && !ids.includes(directTraineeId)) ids.unshift(directTraineeId);
  return ids;
}

// trainingGate is null/false once nothing's holding this item back, or one
// of 'ground_school' / 'in_loft' / 'new_hire_grace' identifying *why* it's
// not due yet - see trainingGateReason below. Kept distinct from a plain
// boolean so the frontend can show the actual reason (e.g. someone who's
// finished ground school but is still mid-LOFT shouldn't read "ground
// school not yet complete").
function dueInfo(dueDate, completedDate, planned, trainingGate, issued, note) {
  const completed = completedDate ? new Date(completedDate).toISOString() : null;
  const plannedDate = planned?.plannedDate ? new Date(planned.plannedDate).toISOString() : null;
  const plannedAssignedTo = planned?.assignedToName
    ? { id: planned.assignedTo, name: planned.assignedToName, arn: planned.assignedToArn, role: planned.assignedToRole }
    : null;
  // A typed note explaining why this check is currently overdue (e.g.
  // "Awaiting simulator availability") - purely informational, same as
  // plannedDate/plannedAssignedTo above, and can exist independently of
  // whether a date's actually been booked in yet.
  const overdueReason = planned?.reason || null;
  // A manual confirmation that this planned check is actually on the
  // roster, not just planned/booked - see the IPC/PC Spacing tab's
  // "Rostered" button (planning.js). Deliberately separate from
  // plannedDate/plannedAssignedTo, which can exist without this being true.
  const rostered = !!planned?.rostered;
  if (!dueDate) {
    return { dueDate: null, status: trainingGate ? 'in_training' : 'overdue', trainingGate: trainingGate || null, completedDate: completed, plannedDate, plannedAssignedTo, issued: !!issued, note: note || null, overdueReason, rostered };
  }
  return { dueDate: dueDate.toISOString(), status: statusFor(dueDate), trainingGate: trainingGate || null, completedDate: completed, plannedDate, plannedAssignedTo, issued: !!issued, note: note || null, overdueReason, rostered };
}

// Picks which of the (possibly several) training gates above actually
// applies, in priority order, so dueInfo's status/trainingGate reflects the
// real reason rather than always defaulting to the ground-school message -
// e.g. someone who's finished ground school but hasn't finished LOFT yet
// (isInLoft) is "still in LOFT training", not "ground school incomplete".
function trainingGateReason(groundSchoolIncomplete, inLoft, extra) {
  if (groundSchoolIncomplete) return 'ground_school';
  if (inLoft) return 'in_loft';
  return extra || null;
}

// HOTC/HOFO/Flight Ops Admin can note a planned date for an upcoming check
// (e.g. "PC booked for 15 Aug") before it's actually conducted, optionally
// with an examiner/instructor/check pilot already assigned (see the new
// Planning page) - purely informational, shown alongside the computed due
// date on Currency Overview and the crew member's own profile, and used to
// prefill the assignee when the real check is later created.
const PLANNED_CHECK_KEYS = ['emergencyProcedures', 'ipc', 'proficiencyCheck', 'lineCheck'];

// Maps a planned-check key to what the real check record needs once the
// "Create check form" button (see the create-check route below) turns it
// into an actual check: the checks.check_type value, and - for
// RECURRENT_SIMULATOR, which covers both PC and IPC under one checkType -
// the details.variant ProficiencyChecks.jsx filters on.
const CHECK_KEY_TO_CHECK_TYPE = {
  emergencyProcedures: () => ({ checkType: 'EMERGENCY_PROCEDURES' }),
  ipc: () => ({ checkType: 'RECURRENT_SIMULATOR', variant: 'IPC_PC' }),
  proficiencyCheck: () => ({ checkType: 'RECURRENT_SIMULATOR', variant: 'PC' }),
  lineCheck: (crewType) => ({ checkType: crewType === 'CABIN_ATTENDANT' ? 'CABIN_ATTENDANT_LINE_CHECK' : 'PILOT_LINE_CHECK' }),
};

// Mirrors frontend/src/lib/format.js's FLEET_LABELS, but for the plain
// aircraft-type string the check forms themselves store in details.actype
// (see ProficiencyChecks.jsx/CaChecks.jsx AIRCRAFT_TYPES) - the cabin
// attendant fleet values map to the same aircraft type as their pilot
// counterpart, just without the "Cabin" prefix used elsewhere in the UI.
const FLEET_TO_AIRCRAFT_TYPE = {
  DASH_8: 'Dash 8',
  FOKKER_100: 'Fokker 100',
  METRO_23: 'Metro',
  CA_DASH_8: 'Dash 8',
  CA_FOKKER_100: 'Fokker 100',
};

// Carries the assigned examiner/instructor/check pilot into the same
// details fields each check form's own "assign" pickers already populate
// (see EpChecks.jsx/PilotLineCheck.jsx/CaChecks.jsx reassign() and
// ProficiencyChecks.jsx's onSelect carry-over) - RECURRENT_SIMULATOR (PC/IPC)
// keys these as examinerName/examinerArn, everything else as assessor/assessorArn.
function assessorDetailsFor(checkType, assignedToId, assignee) {
  if (!assignedToId) return {};
  if (checkType === 'RECURRENT_SIMULATOR') {
    return { assessor: assignee.assignedToName, examinerName: assignee.assignedToName, examinerArn: assignee.assignedToArn };
  }
  return { assessorId: assignedToId, assessor: assignee.assignedToName, assessorArn: assignee.assignedToArn };
}

async function plannedDatesFor(crewMemberId) {
  const { rows } = await pool.query(
    'SELECT check_key, planned_date, assigned_to, assigned_to_name, assigned_to_arn, assigned_to_role, reason, rostered FROM crew_planned_checks WHERE crew_member_id = $1',
    [crewMemberId],
  );
  return Object.fromEntries(rows.map((r) => [r.check_key, {
    plannedDate: r.planned_date,
    assignedTo: r.assigned_to,
    assignedToName: r.assigned_to_name,
    assignedToArn: r.assigned_to_arn,
    assignedToRole: r.assigned_to_role,
    reason: r.reason,
    rostered: r.rostered,
  }]));
}

// Quick-add lets an admin seed a crew member's currency clock with a date
// (e.g. "last EP date") without a real check ever having been conducted
// through this app - stored directly on crew_members (seed_ep_date etc.),
// not as a synthetic checks row. Once a real check is completed, its date
// naturally takes over since it'll be later than the one-off seed date.
function latestOf(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

const CURRENCY_LABELS = {
  emergencyProcedures: 'Emergency Procedures',
  ipc: 'IPC',
  proficiencyCheck: 'Proficiency Check',
  lineCheck: 'Line Check',
};

// Every active competency type applies to every crew member automatically
// (see 0037_competency_types.sql) - this is a LEFT JOIN so a type with no
// dates entered yet for this person still comes back (with nulls), rather
// than requiring a crew_competencies row to already exist.
async function activeCompetencies(crewMemberId, crewType, crewFleets) {
  const { rows } = await pool.query(
    `SELECT ct.name, cc.due_date, cc.planned_date, cc.completed_date, COALESCE(cc.na, false) AS na
     FROM competency_types ct
     LEFT JOIN crew_competencies cc ON cc.competency_type_id = ct.id AND cc.crew_member_id = $1
     WHERE ct.archived = false AND (ct.applies_to IS NULL OR ct.applies_to = $2)
       AND (ct.fleets IS NULL OR ct.fleets && $3::fleet[])
       AND (ct.staff_roles IS NULL OR EXISTS (
         SELECT 1 FROM crew_members cm JOIN users u ON u.id = cm.user_id WHERE cm.id = $1 AND u.role = ANY(ct.staff_roles)
       ))
       AND ct.syllabus_id IS NOT DISTINCT FROM (SELECT syllabus_id FROM crew_members WHERE id = $1)`,
    [crewMemberId, crewType, crewFleets],
  );
  return rows;
}

// The single place that decides "does this need a highlight" - a recurrent
// check or competency counts as urgent when it's overdue or due within the
// soon-window. A planned date doesn't remove it from this list (an admin
// who's already booked it in still needs to see it's due) - it's just
// carried through so the UI can show "Planned for X" alongside the status.
// Reused by the Crew roster row, Currency Overview, and the crew profile's
// own Expiry tab highlight, so all three agree on the same definition.
function isUrgent(status) {
  return status === 'overdue' || status === 'important' || status === 'due_soon' || status === 'approaching' || status === 'not_completed';
}

// Shared by urgentItemsFor (below, filtered to just what needs attention)
// and allItemsFor (Currency Overview's "show me everyone" view) - both
// agree on the same underlying item list, just with a different filter
// applied afterwards.
// Refresher Training runs on exactly the same clock as the pilot Line
// Check itself - 365 days from Check to Line, then 365 days from whichever
// Line Check was most recently completed, per the operator's explicit
// rule. Previously this only ever computed a single fixed anchor+365
// default and never re-based after a subsequent Line Check, so a pilot who
// came out of LOFT and had already had one or more real Line Checks since
// would show Refresher Training as overdue/not-yet-completed off a long-
// stale date instead of their actual next anniversary. Reuses the Line
// Check's own already-correct due date (currency.lineCheck.dueDate, see
// pilotLineCheckDue/nextDueRolling above) rather than recomputing the same
// rule twice. Only kicks in when nothing has actually been entered against
// Refresher Training itself yet - a real completed/due date always wins.
function withRefresherDefaultDue(member, name, dueDate, lineCheckDueDate) {
  if (name === 'Refresher Training' && !dueDate && member.type === 'PILOT' && lineCheckDueDate) {
    return new Date(lineCheckDueDate);
  }
  return dueDate;
}

const NEW_HIRE_GRACE_DAYS = 182; // ~6 months

// A pilot crew member flagged new_hire_pilot (see 0087 migration) hasn't
// had the chance to sit a recurrent Proficiency Check or Refresher Training
// yet - hold off flagging either overdue until 6 months after their Check
// to Line (line_check_anchor_date, the anchor their whole recurrency clock
// is built from), per the operator's explicit request. Before Check to Line
// even completes there's no anchor date to compute from yet, so grace stays
// active unconditionally until one is set. Only ever suppresses the "never
// done one" case - see the call sites below, which still let a real
// completed date win regardless of this flag.
function newHireGraceActive(member) {
  if (!member.newHirePilot) return false;
  if (!member.lineCheckAnchorDate) return true;
  return new Date() < addDays(new Date(member.lineCheckAnchorDate), NEW_HIRE_GRACE_DAYS);
}

async function itemsFor(member, currency, inLoft) {
  const fromCurrency = Object.entries(currency)
    .filter(([, info]) => !!info)
    .map(([key, info]) => ({
      label: CURRENCY_LABELS[key] || key,
      status: info.status,
      dueDate: info.dueDate,
      completedDate: info.completedDate,
      plannedDate: info.plannedDate,
      issued: info.issued,
      overdueReason: info.overdueReason,
    }));

  const competencies = await activeCompetencies(member.id, member.type, member.fleets);
  const newHireGrace = newHireGraceActive(member);
  const fromCompetencies = competencies
    .filter((c) => !c.na)
    .map((c) => {
      const dueDate = withRefresherDefaultDue(member, c.name, c.due_date, currency.lineCheck?.dueDate);
      // See newHireGraceActive above - Refresher Training is the other half
      // of the operator's "PC and Refresher Training" new-hire grace period.
      // Also suppressed for anyone still genuinely in LOFT (see isInLoft) -
      // it isn't due until well after their first Line Check, regardless of
      // whether they were specifically flagged new_hire_pilot.
      const suppressed = c.name === 'Refresher Training' && !c.completed_date && (newHireGrace || inLoft);
      return {
        label: c.name,
        status: suppressed ? 'in_training' : competencyStatus(dueDate),
        dueDate,
        completedDate: c.completed_date,
        plannedDate: c.planned_date,
      };
    });

  return [...fromCurrency, ...fromCompetencies];
}

async function urgentItemsFor(member, currency, inLoft) {
  const items = await itemsFor(member, currency, inLoft);
  return items.filter((i) => isUrgent(i.status));
}

// Every recurrent check and competency, whatever its status - Currency
// Overview shows the whole roster's picture (not just problems) so
// "everything's fine" is as visible as "this is overdue".
async function allItemsFor(member, currency, inLoft) {
  return itemsFor(member, currency, inLoft);
}

async function withCurrency(member) {
  const [planned, upgradeTraineeId, loftTraineeIds] = await Promise.all([
    plannedDatesFor(member.id), activeUpgradeTraineeId(member.id), allLinkedTraineeIds(member.id, member.traineeId),
  ]);
  // See activeUpgradeTraineeId above - falls back to an in-progress upgrade
  // trainee record when this crew profile has no direct trainee_id link of
  // its own (the normal case once someone's already on the Crew roster).
  const effectiveTraineeId = member.traineeId || upgradeTraineeId;
  const inLoft = await isInLoft(effectiveTraineeId);
  let currency;
  // Only set for pilots - see lastPcOnly below and planning.js's IPC/PC
  // Spacing report, the sole consumer.
  let ipcPcRaw = null;

  if (member.type === 'PILOT') {
    const [epChk, ipcChk, pcChk, lineCheckCount, lastLineCheckChk, groundSchoolIncomplete, epIssued, ipcIssued, pcIssued, lineCheckIssued] = await Promise.all([
      lastCompletedCheck(member.id, 'EMERGENCY_PROCEDURES'),
      lastCompletedCheck(member.id, 'RECURRENT_SIMULATOR', 'IPC_PC'),
      lastCompletedCheck(member.id, 'RECURRENT_SIMULATOR', 'PC'),
      completedPilotLineCheckCount(member.id),
      lastCompletedCheck(member.id, 'PILOT_LINE_CHECK'),
      hasIncompleteGroundSchool(effectiveTraineeId),
      hasInProgressCheck(member.id, 'EMERGENCY_PROCEDURES'),
      hasInProgressCheck(member.id, 'RECURRENT_SIMULATOR', 'IPC_PC'),
      hasInProgressCheck(member.id, 'RECURRENT_SIMULATOR', 'PC'),
      hasInProgressCheck(member.id, 'PILOT_LINE_CHECK'),
    ]);
    const ep = latestOf(epChk, member.seedEpDate);
    const ipc = latestOf(ipcChk, member.seedIpcDate);
    // An IPC's requirements cover a Proficiency Check too (it includes a
    // licence reissue on top of what a PC alone would test), so completing
    // one resets the PC's 365-day clock as well - not just a dedicated
    // PC-variant check. The reverse doesn't hold: a plain PC doesn't touch
    // the IPC's own due date above. Uses ipc (already seed-aware) rather
    // than the raw ipcChk, so a pilot whose qualifying IPC was entered as a
    // one-off seed date (e.g. onboarded before this app existed) still gets
    // the same treatment as one completed through a real in-app check.
    const pc = latestOf(latestOf(pcChk, ipc), member.seedPcDate);
    // See newHireGraceActive above - a flagged new hire who's never sat a
    // PC yet stays "in training" rather than "overdue" until 6 months past
    // their Check to Line, on top of the ground-school gate above.
    const pcSuppressed = !pc && newHireGraceActive(member);
    // A pilot out of LOFT who's completed their qualifying IPC but has
    // never yet sat a dedicated Proficiency Check - the gap right after
    // finishing LOFT, before their first stand-alone PC - is due one
    // exactly 6 calendar months after that IPC (addMonths, not a 182-day
    // approximation - see addMonths' own comment: the fixed day-count
    // version could land a day or two off the real anniversary and flag it
    // overdue early), not the usual 365-day rolling clock, per the
    // operator's explicit rule that the first PC is done 6 months after
    // the IPC. Checked against ipc (seed-aware, see pc above) rather than
    // the raw ipcChk for the same reason. This only covers that one "never
    // had a real PC" gap; once a dedicated PC-variant check (or a seeded PC
    // date) exists, the normal 365-day clock above (still anchored off
    // either check type) takes over as before.
    const pcNeverCompleted = !pcChk && !member.seedPcDate;
    const pcDueDateIsFirstEstimate = pcNeverCompleted && !!ipc;
    const pcDueDate = pcDueDateIsFirstEstimate ? addMonths(new Date(ipc), 6) : nextDueRolling(pc);
    // The true last-PC-only completion (unlike pc above, which falls back to
    // ipc for due-date rolling purposes) - null until a dedicated PC-variant
    // check or seed date actually exists. Surfaced on the member for the
    // IPC/PC Spacing report (see planning.js), which needs the real gap
    // between two distinct checks, not a due-date estimate.
    const lastPcOnly = latestOf(pcChk, member.seedPcDate);
    ipcPcRaw = { lastIpc: ipc, lastPc: lastPcOnly };
    // Not yet a fully current line pilot - IPC, Line Check and Refresher
    // Training (see itemsFor above) don't apply until LOFT is actually
    // finished, regardless of where ground school itself is up to
    // (groundSchoolIncomplete only covers the earlier phase), per the
    // operator's explicit request. EP is deliberately left out of this gate
    // - EP training happens early in LOFT and should still show as
    // applicable. PC used to be left out too (relying solely on the
    // pcDueDate/pcSuppressed logic below), but that only covers a pilot
    // explicitly flagged new_hire_pilot - a LOFT trainee with no such flag
    // (the normal case) had nothing suppressing PC at all, so it read
    // "overdue" the moment nextDueRolling(null) came back empty, despite
    // never having sat an IPC yet to even start that clock. PC now shares
    // the same in-LOFT gate as IPC/Line Check.
    const loftGateReason = trainingGateReason(groundSchoolIncomplete, inLoft);
    const pcGateReason = trainingGateReason(groundSchoolIncomplete, inLoft, pcSuppressed ? 'new_hire_grace' : null);
    currency = {
      emergencyProcedures: dueInfo(nextDueRolling(ep), ep, planned.emergencyProcedures, groundSchoolIncomplete ? 'ground_school' : null, epIssued),
      ipc: dueInfo(nextDueRolling(ipc), ipc, planned.ipc, loftGateReason, ipcIssued),
      proficiencyCheck: dueInfo(pcDueDate, pc, planned.proficiencyCheck, pcGateReason, pcIssued, pcDueDateIsFirstEstimate ? 'No Proficiency Check completed yet' : null),
      // Falls back to the initial Check to Line anchor date when no
      // recurrent Line Check has ever been completed yet. If there's no
      // anchor at all (e.g. a crew profile onboarded without one) but a
      // Line Check has genuinely been completed, that fixed-anniversary
      // calculation has nothing to work from and returns null - fall back
      // to a rolling 365 days from the last completion instead (same rule
      // EP/IPC/PC already use), rather than leaving them stuck reading
      // "never completed" forever despite a real completed check on file.
      lineCheck: dueInfo(pilotLineCheckDue(member.lineCheckAnchorDate, lineCheckCount) || nextDueRolling(lastLineCheckChk), lastLineCheckChk || member.lineCheckAnchorDate, planned.lineCheck, loftGateReason, lineCheckIssued),
    };
  } else {
    const [epChk, lineCheckChk, epIssued, lineCheckIssued, groundSchoolIncomplete] = await Promise.all([
      lastCompletedCheck(member.id, 'EMERGENCY_PROCEDURES'),
      lastCompletedCheck(member.id, 'CABIN_ATTENDANT_LINE_CHECK'),
      hasInProgressCheck(member.id, 'EMERGENCY_PROCEDURES'),
      hasInProgressCheck(member.id, 'CABIN_ATTENDANT_LINE_CHECK'),
      hasIncompleteGroundSchool(effectiveTraineeId),
    ]);
    const ep = latestOf(epChk, member.seedEpDate);
    const lineCheck = latestOf(lineCheckChk, member.seedLineCheckDate);
    currency = {
      emergencyProcedures: dueInfo(nextDueRolling(ep), ep, planned.emergencyProcedures, groundSchoolIncomplete ? 'ground_school' : null, epIssued),
      lineCheck: dueInfo(nextDueRolling(lineCheck), lineCheck, planned.lineCheck, trainingGateReason(groundSchoolIncomplete, inLoft), lineCheckIssued),
    };
  }

  return {
    ...member,
    // Surfaced to the frontend so Currency Overview can add an "IN LOFT"
    // remark alongside an overdue/due-soon item, since some of what's
    // flagged there is expected while training is still in progress rather
    // than a real oversight.
    inLoft,
    // See allLinkedTraineeIds above - every trainee record whose Check to
    // Line/Landing Assessment/flights belong to this crew member (direct
    // link and every reverse-linked upgrade/fleet-conversion record),
    // most recent first. Empty for a crew profile that's never been
    // through LOFT at all.
    loftTraineeIds,
    currency,
    urgentItems: await urgentItemsFor(member, currency, inLoft),
    allItems: await allItemsFor(member, currency, inLoft),
    ipcPcRaw,
  };
}

// Shared by GET / below and the Home Dashboard (dashboard.js) - both need
// the exact same currency computation over the roster, and must never
// disagree about what's overdue/due soon/current.
async function listCrewWithCurrency({ type, archived = false } = {}) {
  const conditions = ['crew_members.archived = $1'];
  const params = [archived];
  if (type) { params.push(type); conditions.push(`crew_members.type = $${params.length}`); }

  const { rows } = await pool.query(
    `${CREW_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY crew_members.last_name ASC`,
    params,
  );
  return Promise.all(rows.map(serializeCrewMember).map(withCurrency));
}

router.get('/', async (req, res) => {
  const { type, archived } = req.query;
  const effectiveType = isCaOnlyRole(req.user) ? 'CABIN_ATTENDANT' : type;
  const members = await listCrewWithCurrency({ type: effectiveType, archived: archived === 'true' });
  // Roster/overview views don't need the (potentially large) base64 licence
  // photo - only the crew member's own detail page does (see GET /:id).
  res.json(members.map(({ licencePhoto, ...rest }) => rest));
});

router.get('/:id', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (forbiddenForCaManager(req, member)) return res.status(403).json({ error: 'Forbidden' });
  res.json(await withCurrency(member));
});

const quickAddSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  type: z.enum(['PILOT', 'CABIN_ATTENDANT']),
  role: z.enum(['CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT']),
  fleets: z.array(z.enum(FLEET_VALUES)).min(1),
  // The crew member's own ARN (distinct from a linked staff account's ARN,
  // if any) - required for pilots so it can be autofilled into check forms
  // (e.g. the Applicant's ARN on an IPC/PC) instead of retyped every time.
  // Cabin attendants don't hold one, so it's optional/ignored for them -
  // see the superRefine below and the insert, which nulls it out for CA.
  arn: z.string().optional(),
  // Seed dates - stored directly on crew_members (see 0028 migration) and
  // merged with any real completed check by withCurrency, rather than
  // creating a synthetic checks row for a check that was never conducted
  // through this app.
  lastEpDate: z.string().optional(),
  lastIpcDate: z.string().optional(),
  lastPcDate: z.string().optional(),
  lineCheckAnchorDate: z.string().optional(),
  lastLineCheckDate: z.string().optional(),
  // Links straight to a staff account at creation, e.g. a Training Captain
  // who is themselves subject to recurrent currency - avoids ever having
  // two separate records (Staff + a hand-typed Crew duplicate) for the
  // same person. See CREW_SELECT/serializeCrewMember for how a linked
  // member's name is then read live from Staff.
  userId: z.string().uuid().nullable().optional(),
  // When set, also creates a matching trainee LOFT record (see the
  // newHire handling in POST / below) - for someone joining who needs to
  // go through initial training/phases, not just be tracked for currency.
  newHire: z.boolean().optional(),
  // Onboarding an already-qualified pilot (rather than growing one from a
  // trainee) has no IPC on file yet to capture this from - lets it be set
  // straight away instead of waiting for their first IPC through this app.
  licencePhoto: z.string().nullable().optional(),
  // Which named syllabus (see syllabi.js) this crew member's Competencies
  // come from - null/omitted means the standard bucket. Scoped to their
  // first ticked fleet, since a named syllabus is always single-fleet.
  syllabusId: z.string().uuid().nullable().optional(),
}).superRefine((d, ctx) => {
  if (d.type === 'PILOT' && !d.arn?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['arn'], message: 'ARN is required for pilots' });
  }
});

// Shared by the single "Quick add crew member" route below and the bulk
// spreadsheet import - one real INSERT path so both stay in lockstep
// instead of two copies of the same SQL drifting apart. Returns
// { error, status? } on failure (never throws for expected failures) or
// { member } on success, so callers can decide how to report it (a single
// res.status(...).json(...) for the one-at-a-time route, or a per-row
// result entry for bulk import).
async function createCrewMemberRecord(d, req) {
  const fleetError = fleetOrderError(d.type, d.fleets);
  if (fleetError) return { error: fleetError };

  let rows;
  try {
    ({ rows } = await pool.query(
      `INSERT INTO crew_members (first_name, last_name, type, role, fleets, line_check_anchor_date, seed_ep_date, seed_ipc_date, seed_pc_date, seed_line_check_date, user_id, arn, licence_photo, syllabus_id, new_hire_pilot)
       VALUES ($1, $2, $3, $4, $5::fleet[], $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [
        d.firstName,
        d.lastName,
        d.type,
        d.role,
        d.fleets,
        d.type === 'PILOT' ? (d.lineCheckAnchorDate || null) : null,
        d.lastEpDate || null,
        d.type === 'PILOT' ? (d.lastIpcDate || null) : null,
        d.type === 'PILOT' ? (d.lastPcDate || null) : null,
        d.type === 'CABIN_ATTENDANT' ? (d.lastLineCheckDate || null) : null,
        d.userId || null,
        d.type === 'PILOT' ? d.arn : null,
        d.type === 'PILOT' ? (d.licencePhoto || null) : null,
        d.syllabusId || null,
        d.type === 'PILOT' ? !!d.newHire : false,
      ],
    ));
  } catch (err) {
    if (err.code === '23505') return { error: 'That staff account is already linked to another crew profile', status: 409 };
    throw err;
  }
  const member = serializeCrewMember(rows[0]);

  if (d.traineeId) {
    // Called from trainees.js POST / (new-hire-from-LOFT flow, see below) -
    // the trainee record already exists, so just link back to it rather
    // than creating a second one.
    await pool.query('UPDATE crew_members SET trainee_id = $1 WHERE id = $2', [d.traineeId, member.id]);
    member.traineeId = d.traineeId;
  } else if (d.newHire) {
    // Fire-and-forget-ish but awaited: a new hire needs a trainee LOFT
    // record too (ground school/phases/flights), separate from this crew
    // profile (which just tracks their ongoing recurrent currency). Linked
    // back via crew_members.trainee_id so withCurrency can tell this crew
    // member hasn't finished ground school yet, and hold off flagging them
    // overdue on EP/IPC/PC/Line Check before they've even started (see
    // hasIncompleteGroundSchool). Best effort - if this fails, the crew
    // member is still created; the admin can add the trainee record by
    // hand from the Trainees tab instead.
    try {
      const { rows: traineeRows } = await pool.query(
        `INSERT INTO trainees (first_name, last_name, type, role, fleet, phase) VALUES ($1, $2, $3, $4, $5, 1) RETURNING id`,
        [d.firstName, d.lastName, d.type, d.role, d.fleets[0]],
      );
      await pool.query('UPDATE crew_members SET trainee_id = $1 WHERE id = $2', [traineeRows[0].id, member.id]);
      member.traineeId = traineeRows[0].id;
    } catch (err) {
      // Swallow - the crew profile creation above already succeeded and
      // is the primary outcome of this request.
    }
  }

  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'crew_members', targetId: member.id,
    description: `Added crew member ${member.name}`,
  });
  return { member: await withCurrency(member) };
}

router.post('/', blockCaManager, async (req, res) => {
  const parsed = quickAddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await createCrewMemberRecord(parsed.data, req);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.status(201).json(result.member);
});

// Bulk import from a spreadsheet (see frontend BulkImportCrew.jsx, which
// parses the .xlsx/.csv client-side and maps its columns onto this same
// shape) - one row at a time through the exact same creation path as the
// single "Quick add" form above, so validation never disagrees between the
// two. Deliberately doesn't support linking to an existing staff account or
// auto-creating a trainee record (userId/newHire/licencePhoto) - those are
// edge cases better handled one at a time; a spreadsheet import is for the
// common case of seeding many already-qualified crew at once. Partial
// success is the point - invalid rows are reported back, not one bad row
// failing the whole batch.
router.post('/bulk-import', blockCaManager, async (req, res) => {
  const rowsInput = Array.isArray(req.body.rows) ? req.body.rows : null;
  if (!rowsInput) return res.status(400).json({ error: 'rows must be an array' });
  if (rowsInput.length === 0) return res.status(400).json({ error: 'No rows to import' });
  if (rowsInput.length > 500) return res.status(400).json({ error: 'Maximum 500 rows per import - split into smaller batches' });

  const results = [];
  for (let i = 0; i < rowsInput.length; i++) {
    // +2 so this matches the spreadsheet row the operator would count by
    // eye (1-indexed, plus the header row).
    const rowNumber = i + 2;
    const rawRow = rowsInput[i] || {};
    const name = `${rawRow.firstName || ''} ${rawRow.lastName || ''}`.trim() || null;

    const parsed = quickAddSchema.safeParse(rawRow);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const message = Object.entries(fieldErrors).map(([field, msgs]) => `${field}: ${msgs.join(', ')}`).join('; ') || 'Invalid row';
      results.push({ row: rowNumber, name, status: 'error', error: message });
      continue;
    }

    const result = await createCrewMemberRecord(parsed.data, req);
    if (result.error) {
      results.push({ row: rowNumber, name, status: 'error', error: result.error });
    } else {
      results.push({ row: rowNumber, name: result.member.name, status: 'created', id: result.member.id });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  res.json({ created, failed: results.length - created, results });
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT']).optional(),
  fleets: z.array(z.enum(FLEET_VALUES)).min(1).optional(),
  lineCheckAnchorDate: z.string().nullable().optional(),
  arn: z.string().min(1).optional(),
  // Links this crew profile to an existing staff account (see CREW_SELECT)
  // so name is read live from Staff instead of drifting out of sync.
  userId: z.string().uuid().nullable().optional(),
  // One-off manual backfill for staff already employed when this feature
  // shipped - going forward, licence photos are captured via the IPC form
  // instead (see checks.js PATCH /:id/licence-photo).
  licencePhoto: z.string().nullable().optional(),
  // Captain in Training assessments (SA 567/568) are only ever offered for
  // a pilot an admin has explicitly allocated to a Captain upgrade - see
  // CrewDetail.jsx's CurrencyFolder (citPrelim/citFinal tabs).
  captainInTraining: z.boolean().optional(),
  // See newHireGraceActive above - correctable after creation (e.g. a
  // trainee onboarded before this existed, or ticked by mistake), but only
  // by HOTC/HOFO/Flight Ops Admin specifically, per the operator's explicit
  // request (narrower than the rest of this route, which also allows
  // Alternate) - enforced below rather than in the schema itself.
  newHirePilot: z.boolean().optional(),
  // IPC/PC Spacing report (Planning tab) - a freeform forward-planning note
  // against this pilot's IPC/PC recurrency (e.g. "simulator slot booked with
  // 3rd party"), surfaced alongside their real due-date/compliance status
  // (see planning.js's GET /ipc-pc-spacing). Pilots only, but not worth
  // enforcing server-side - a stray value on a CA record is harmless since
  // nothing reads it outside that report, which only queries pilots.
  pcIpcOverrideComment: z.string().nullable().optional(),
});

const COLUMN_MAP = {
  firstName: 'first_name',
  lastName: 'last_name',
  role: 'role',
  fleets: 'fleets',
  lineCheckAnchorDate: 'line_check_anchor_date',
  arn: 'arn',
  userId: 'user_id',
  captainInTraining: 'captain_in_training',
  licencePhoto: 'licence_photo',
  newHirePilot: 'new_hire_pilot',
  pcIpcOverrideComment: 'pc_ipc_override_comment',
};
const CAST_MAP = { fleets: '::fleet[]' };
const NEW_HIRE_TOGGLE_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

router.patch('/:id', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (forbiddenForCaManager(req, member)) return res.status(403).json({ error: 'Forbidden' });
  if (!assertNotArchived(member, res)) return;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (parsed.data.newHirePilot !== undefined && !NEW_HIRE_TOGGLE_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can change the new hire flag' });
  }

  const fleetError = fleetOrderError(member.type, parsed.data.fleets ?? member.fleets);
  if (fleetError) return res.status(400).json({ error: fleetError });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.json(await withCurrency(member));

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}${CAST_MAP[key] || ''}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  try {
    await pool.query(
      `UPDATE crew_members SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values,
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That staff account is already linked to another crew profile' });
    throw err;
  }
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'crew_members', targetId: member.id });
  // Re-fetch through the same join CREW_SELECT uses, rather than trusting
  // the UPDATE's own RETURNING row - a linked member's name/fleets only
  // come back correctly once joined against the newly-linked user.
  res.json(await withCurrency(await findCrewMember(req.params.id)));
});

// Mirrors frontend/src/pages/CrewDetail.jsx's OVERDUE_REASONS - a fixed
// dropdown rather than free text, per the operator's explicit request.
const OVERDUE_REASONS = ['In LOFT', 'Sick Leave', 'Personal Leave', 'Failed Check'];
const plannedCheckSchema = z.object({
  plannedDate: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  reason: z.enum(OVERDUE_REASONS).nullable().optional(),
  rostered: z.boolean().optional(),
});

router.put('/:id/planned-checks/:checkKey', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (forbiddenForCaManager(req, member)) return res.status(403).json({ error: 'Forbidden' });
  if (!assertNotArchived(member, res)) return;
  if (!PLANNED_CHECK_KEYS.includes(req.params.checkKey)) return res.status(400).json({ error: 'Invalid check' });

  const parsed = plannedCheckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  // Distinguish "not sent, leave as-is" from an explicit null (clear it) for
  // each field - mirrors checks.js/ctl.js's own assignee-patch handling.
  // plannedDate and reason can now be set independently of each other (a
  // typed reason a check is overdue doesn't require a date to already be
  // booked in), so a row can exist with either, both, or (once both are
  // cleared) neither.
  const hasPlannedDate = Object.prototype.hasOwnProperty.call(req.body, 'plannedDate');
  const hasAssignedTo = Object.prototype.hasOwnProperty.call(req.body, 'assignedTo');
  const hasReason = Object.prototype.hasOwnProperty.call(req.body, 'reason');
  const hasRostered = Object.prototype.hasOwnProperty.call(req.body, 'rostered');

  const { rows: existingRows } = await pool.query(
    'SELECT planned_date, reason, rostered FROM crew_planned_checks WHERE crew_member_id = $1 AND check_key = $2',
    [member.id, req.params.checkKey],
  );
  const existing = existingRows[0];
  const finalPlannedDate = hasPlannedDate ? (parsed.data.plannedDate || null) : (existing?.planned_date || null);
  const finalReason = hasReason ? (parsed.data.reason || null) : (existing?.reason || null);
  // A newly-saved planned date invalidates any earlier "rostered"
  // confirmation - that confirmation was for the old date, and this route
  // only ever sees a genuine plannedDate change (the frontend's date input
  // only calls this when the value actually changed), so it's never falsely
  // cleared by a same-value resave.
  const finalRostered = hasRostered ? !!parsed.data.rostered : (hasPlannedDate ? false : !!existing?.rostered);
  if (finalRostered && !finalPlannedDate) return res.status(400).json({ error: 'Set a planned date before marking this rostered' });

  if (!finalPlannedDate && !finalReason) {
    await pool.query('DELETE FROM crew_planned_checks WHERE crew_member_id = $1 AND check_key = $2', [member.id, req.params.checkKey]);
  } else {
    const assignee = hasAssignedTo
      ? await resolveAssignee(parsed.data.assignedTo)
      : { assignedToName: null, assignedToArn: null, assignedToRole: null };
    await pool.query(
      `INSERT INTO crew_planned_checks (crew_member_id, check_key, planned_date, assigned_to, assigned_to_name, assigned_to_arn, assigned_to_role, reason, rostered)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $9, $10)
       ON CONFLICT (crew_member_id, check_key) DO UPDATE SET
         planned_date = $3,
         assigned_to = CASE WHEN $8 THEN $4::uuid ELSE crew_planned_checks.assigned_to END,
         assigned_to_name = CASE WHEN $8 THEN $5 ELSE crew_planned_checks.assigned_to_name END,
         assigned_to_arn = CASE WHEN $8 THEN $6 ELSE crew_planned_checks.assigned_to_arn END,
         assigned_to_role = CASE WHEN $8 THEN $7 ELSE crew_planned_checks.assigned_to_role END,
         reason = $9,
         rostered = $10`,
      [
        member.id, req.params.checkKey, finalPlannedDate,
        hasAssignedTo ? (parsed.data.assignedTo || null) : null,
        assignee.assignedToName, assignee.assignedToArn, assignee.assignedToRole,
        hasAssignedTo,
        finalReason,
        finalRostered,
      ],
    );
  }
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'crew_planned_checks', targetId: member.id });
  res.json(await withCurrency(member));
});

// Turns a planned check into the real thing, once both a planned date and
// an assigned examiner/instructor/check pilot are in place - the Planning
// tab only shows this button once both are set (see Planning.jsx). Deletes
// the planned-check row afterwards, so the Planning tab row disappears now
// that it's a real, in-progress check instead of just a plan.
router.post('/:id/planned-checks/:checkKey/create-check', blockCaManager, async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (!assertNotArchived(member, res)) return;
  if (!PLANNED_CHECK_KEYS.includes(req.params.checkKey)) return res.status(400).json({ error: 'Invalid check' });

  const { rows: plannedRows } = await pool.query(
    'SELECT * FROM crew_planned_checks WHERE crew_member_id = $1 AND check_key = $2',
    [member.id, req.params.checkKey],
  );
  if (plannedRows.length === 0) return res.status(404).json({ error: 'Nothing planned for this check' });
  const planned = rowToCamel(plannedRows[0]);
  if (!planned.plannedDate || !planned.assignedTo) {
    return res.status(400).json({ error: 'A planned date and an assigned examiner are both required' });
  }

  const { checkType, variant } = CHECK_KEY_TO_CHECK_TYPE[req.params.checkKey](member.type);
  const singleFleet = member.fleets?.length === 1 ? member.fleets[0] : undefined;
  // planned_date comes back from Postgres as a Date object - normalize to a
  // plain YYYY-MM-DD before it lands in details.date, which check forms
  // display as-is with no further formatting.
  const dateOnly = new Date(planned.plannedDate).toISOString().slice(0, 10);
  const assessorDetails = assessorDetailsFor(checkType, planned.assignedTo, {
    assignedToName: planned.assignedToName, assignedToArn: planned.assignedToArn,
  });

  const check = await createCheckRecord({
    crewMemberId: member.id,
    checkType,
    fleet: singleFleet,
    appliesTo: member.type,
    assignedTo: planned.assignedTo,
    details: {
      name: member.name,
      role: member.role,
      arn: member.arn,
      date: dateOnly,
      actype: singleFleet ? FLEET_TO_AIRCRAFT_TYPE[singleFleet] : undefined,
      // Carries the candidate's own name/ARN into the Applicant section
      // (RECURRENT_SIMULATOR/PC/IPC) the same way ProficiencyChecks.jsx's
      // own create form already does - otherwise a check created from the
      // Planning tab left these blank.
      ...(checkType === 'RECURRENT_SIMULATOR' ? { applicantName: member.name, applicantArn: member.arn } : {}),
      ...(variant ? { variant } : {}),
      ...assessorDetails,
    },
  });
  await pool.query('DELETE FROM crew_planned_checks WHERE crew_member_id = $1 AND check_key = $2', [member.id, req.params.checkKey]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'checks', targetId: check.id });
  res.status(201).json(check);
});

router.post('/:id/archive', blockCaManager, async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE crew_members SET archived = true, archived_at = now() WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'ARCHIVE', targetTable: 'crew_members', targetId: req.params.id,
    description: `Archived crew member ${rows[0].first_name} ${rows[0].last_name}`,
  });
  // CrewDetail.jsx reads member.urgentItems/.allItems unconditionally - has
  // to go through withCurrency like GET /:id does, or the page blanks with
  // an uncaught render error the moment this response lands.
  res.json(await withCurrency(await findCrewMember(req.params.id)));
});

router.post('/:id/unarchive', blockCaManager, async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE crew_members SET archived = false, archived_at = null WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'crew_members', targetId: req.params.id });
  res.json(await withCurrency(await findCrewMember(req.params.id)));
});

const RETENTION_YEARS = 4;

// Permanent deletion is only ever offered once a record has been archived
// for the full retention period the operator is required to keep it for
// (4 years after leaving the company) - see findCrewMember/ArchiveButton on
// CrewDetail.jsx for the matching frontend gate. checks.crew_member_id is
// ON DELETE SET NULL (history survives, just unlinked - see
// checkSubjectName/crew_member_name snapshot in checks.js); crew_competencies/
// crew_planned_checks/crew_clearances CASCADE since they're just this
// person's current-state tracking, not a record worth keeping once they're
// gone for good.
router.delete('/:id', blockCaManager, async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (!member.archived || !member.archivedAt) {
    return res.status(403).json({ error: 'Only archived records can be deleted' });
  }
  const retainUntil = new Date(member.archivedAt);
  retainUntil.setFullYear(retainUntil.getFullYear() + RETENTION_YEARS);
  if (retainUntil > new Date()) {
    return res.status(403).json({ error: `This record must be retained until ${retainUntil.toISOString().slice(0, 10)} (4 years after archiving)` });
  }

  await pool.query('DELETE FROM crew_members WHERE id = $1', [member.id]);
  await logAction({
    userId: req.user.id, action: 'DELETE', targetTable: 'crew_members', targetId: member.id,
    description: `Permanently deleted crew record for ${member.name} (retention period expired)`,
  });
  res.status(204).send();
});

// Every active competency type (managed on the Syllabus tab - see
// competency-types.js) is required for every crew member, so this always
// returns one row per active type rather than needing them added one at a
// time - dates just get filled in against whichever ones apply.
router.get('/:id/competencies', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (forbiddenForCaManager(req, member)) return res.status(403).json({ error: 'Forbidden' });

  // The catalog-driven types (one row per active type, LEFT JOINed so it
  // shows even with no dates yet) plus any ad-hoc crew_competencies rows
  // that were never linked to a catalog type - the only one of those today
  // is "Right Hand Seat" (checks.js's revalidateRhsCompetency), which is
  // deliberately NOT a catalog type (a catalog type applies to every crew
  // member automatically - RHS only applies to whichever Training
  // Captains/Examiners happen to have sat "Other Seat" on an IPC/PC) - it
  // was being tracked correctly in the database this whole time but was
  // silently invisible here, since this query only ever looked at
  // competency_types rows. Sorted to the end (sort_order 9999) rather than
  // interleaved with the real catalog order.
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT ct.sort_order, ct.created_at, ct.id AS competency_type_id, ct.name, cc.completed_date, cc.due_date, cc.planned_date, COALESCE(cc.na, false) AS na, COALESCE(cc.course_sent, false) AS course_sent
       FROM competency_types ct
       LEFT JOIN crew_competencies cc ON cc.competency_type_id = ct.id AND cc.crew_member_id = $1
       WHERE ct.archived = false AND (ct.applies_to IS NULL OR ct.applies_to = $2)
         AND (ct.fleets IS NULL OR ct.fleets && $3::fleet[])
         AND (ct.staff_roles IS NULL OR EXISTS (
           SELECT 1 FROM crew_members cm JOIN users u ON u.id = cm.user_id WHERE cm.id = $1 AND u.role = ANY(ct.staff_roles)
         ))
       UNION ALL
       SELECT 9999 AS sort_order, cc.created_at, NULL::uuid AS competency_type_id, cc.name, cc.completed_date, cc.due_date, cc.planned_date, COALESCE(cc.na, false) AS na, false AS course_sent
       FROM crew_competencies cc
       WHERE cc.crew_member_id = $1 AND cc.competency_type_id IS NULL AND cc.archived = false
     ) combined
     ORDER BY sort_order ASC, created_at ASC`,
    [member.id, member.type, member.fleets],
  );
  // Refresher Training's default due date rides on the pilot Line Check's
  // own due date (see withRefresherDefaultDue above) - compute it the same
  // way withCurrency does, rather than duplicating currency's whole shape
  // here.
  let lineCheckDueDate = null;
  if (member.type === 'PILOT') {
    const [lineCheckCount, lastLineCheckChk] = await Promise.all([
      completedPilotLineCheckCount(member.id),
      lastCompletedCheck(member.id, 'PILOT_LINE_CHECK'),
    ]);
    lineCheckDueDate = pilotLineCheckDue(member.lineCheckAnchorDate, lineCheckCount) || nextDueRolling(lastLineCheckChk);
  }
  res.json(rows.map(rowToCamel).map((c) => ({ ...c, dueDate: withRefresherDefaultDue(member, c.name, c.dueDate, lineCheckDueDate) })));
});

const competencyDatesSchema = z.object({
  completedDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  plannedDate: z.string().nullable().optional(),
  // Scoped in the frontend to just First Aid/CPR Training (see
  // CrewDetail.jsx) - not every crew member is required to hold every
  // competency.
  na: z.boolean().optional(),
  courseSent: z.boolean().optional(),
});

// Upserts this crew member's dates for one competency type - there's no
// separate "add" step since every active type already shows up (with
// blank dates) via GET above.
router.put('/:id/competencies/:competencyTypeId', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (forbiddenForCaManager(req, member)) return res.status(403).json({ error: 'Forbidden' });
  if (!assertNotArchived(member, res)) return;

  const parsed = competencyDatesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { completedDate, dueDate, plannedDate, na, courseSent } = parsed.data;

  // Once any date has been saved for this competency, only HOTC/HOFO can
  // change it - everyone else is locked out from here on (mirrors the
  // frontend's disabled date inputs, but enforced server-side too since a
  // disabled input alone doesn't stop a direct API call). Refresher
  // Training is the one exception - Flight Ops Admin also administers
  // that course's completions (see PilotLineCheck.jsx's Refresher Training
  // row), so they get the same unlock for this competency only.
  const { rows: existingRows } = await pool.query(
    `SELECT cc.completed_date, cc.due_date, cc.planned_date, ct.name
     FROM competency_types ct
     LEFT JOIN crew_competencies cc ON cc.competency_type_id = ct.id AND cc.crew_member_id = $1
     WHERE ct.id = $2`,
    [member.id, req.params.competencyTypeId],
  );
  const existing = existingRows[0];
  const hasSavedDates = existing && (existing.completed_date || existing.due_date || existing.planned_date);
  const changingDates = Object.prototype.hasOwnProperty.call(req.body, 'completedDate')
    || Object.prototype.hasOwnProperty.call(req.body, 'dueDate')
    || Object.prototype.hasOwnProperty.call(req.body, 'plannedDate');
  const allowedRoles = existing?.name === 'Refresher Training' ? ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'] : ['HOTC', 'HOFO'];
  if (hasSavedDates && changingDates && !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: `Only ${allowedRoles.map((r) => (r === 'FLIGHT_OPS_ADMIN' ? 'Flight Ops Admin' : r)).join(', ')} can change a competency date once it has been saved` });
  }

  const { rows } = await pool.query(
    `INSERT INTO crew_competencies (crew_member_id, competency_type_id, completed_date, due_date, planned_date, na, course_sent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (crew_member_id, competency_type_id)
     DO UPDATE SET completed_date = $3, due_date = $4, planned_date = $5, na = $6, course_sent = $7
     RETURNING *`,
    [member.id, req.params.competencyTypeId, completedDate || null, dueDate || null, plannedDate || null, na || false, courseSent || false],
  );
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'crew_competencies', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

// Clearance Form - the paper trail (SA 539 for cabin attendants, SA 586 for
// pilots) that gets a fresh sign-off box added every time a crew member
// clears a stage: aircraft type conversion/ground school, then check to
// line, then (pilots only) Training Captain and Check Captain. A pilot who
// converts onto another type or upgrades to Captain goes through the
// conversion/line-training stages again, so this is an append-only list
// (like checks) rather than a fixed one-per-person record. Only
// HOTC/HOFO/Flight Ops Admin can even reach this router (see requireRole
// above), so the signing-off "FSM/HOFO" is simply whichever of them is
// logged in and adding the entry - no separate signature step.
router.get('/:id/clearances', blockCaManager, async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });

  const { rows } = await pool.query(
    'SELECT * FROM crew_clearances WHERE crew_member_id = $1 ORDER BY created_at ASC',
    [member.id],
  );
  res.json(rows.map(rowToCamel));
});

const clearanceSchema = z.object({
  stage: z.enum([...new Set([...PILOT_CLEARANCE_STAGES, ...CA_CLEARANCE_STAGES])]),
  details: z.record(z.any()).optional(),
  // Lets an already-completed real-world sign-off be backdated when this
  // crew member's history is first entered into the system, instead of
  // every entry reading as signed "today" - optional, defaults to now().
  signedAt: z.string().optional(),
});

router.post('/:id/clearances', async (req, res) => {
  if (!isClearanceSigner(req.user)) return res.status(403).json({ error: 'Only HOTC and HOFO can sign the clearance form' });
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (!assertNotArchived(member, res)) return;

  const parsed = clearanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const allowedStages = member.type === 'PILOT' ? PILOT_CLEARANCE_STAGES : CA_CLEARANCE_STAGES;
  if (!allowedStages.includes(parsed.data.stage)) return res.status(400).json({ error: 'Invalid stage for this crew member type' });
  const signedAt = parsed.data.signedAt ? new Date(parsed.data.signedAt) : new Date();
  if (Number.isNaN(signedAt.getTime()) || signedAt > new Date()) {
    return res.status(400).json({ error: 'Signed date cannot be in the future' });
  }

  const { rows } = await pool.query(
    `INSERT INTO crew_clearances (crew_member_id, stage, details, signed_by_name, signed_by_user_id, signed_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [member.id, parsed.data.stage, JSON.stringify(parsed.data.details || {}), req.user.name, req.user.id, signedAt],
  );
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'crew_clearances', targetId: rows[0].id });
  res.status(201).json(rowToCamel(rows[0]));
});

router.delete('/:id/clearances/:clearanceId', async (req, res) => {
  if (!isClearanceSigner(req.user)) return res.status(403).json({ error: 'Only HOTC and HOFO can sign the clearance form' });
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (!assertNotArchived(member, res)) return;
  const { rows } = await pool.query(
    'DELETE FROM crew_clearances WHERE id = $1 AND crew_member_id = $2 RETURNING id',
    [req.params.clearanceId, req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'crew_clearances', targetId: req.params.clearanceId });
  res.status(204).send();
});

module.exports = router;
module.exports.listCrewWithCurrency = listCrewWithCurrency;
module.exports.hasIncompleteGroundSchool = hasIncompleteGroundSchool;
module.exports.createCrewMemberRecord = createCrewMemberRecord;
