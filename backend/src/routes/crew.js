const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole, isCaOnlyRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { resolveAssignee } = require('../lib/assignee');
const { nextDueRolling, pilotLineCheckDue, statusFor, competencyStatus, addDays } = require('../lib/currency');
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
  SELECT crew_members.*, u.name AS linked_user_name, u.role AS linked_user_role
  FROM crew_members
  LEFT JOIN users u ON u.id = crew_members.user_id
`;

function serializeCrewMember(row) {
  const m = rowToCamel(row);
  const isLinked = !!m.userId;
  const { linkedUserName, linkedUserRole, ...rest } = m;
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

async function lastCompletedCheck(crewMemberId, checkType, variant) {
  const params = [crewMemberId, checkType];
  let variantClause = '';
  if (variant) {
    params.push(variant);
    variantClause = `AND details->>'variant' = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT completed_at FROM checks
     WHERE crew_member_id = $1 AND check_type = $2 ${variantClause} AND completed_at IS NOT NULL
     ORDER BY completed_at DESC LIMIT 1`,
    params,
  );
  return rows[0]?.completed_at || null;
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

function dueInfo(dueDate, completedDate, planned, groundSchoolIncomplete) {
  const completed = completedDate ? new Date(completedDate).toISOString() : null;
  const plannedDate = planned?.plannedDate ? new Date(planned.plannedDate).toISOString() : null;
  const plannedAssignedTo = planned?.assignedToName
    ? { id: planned.assignedTo, name: planned.assignedToName, arn: planned.assignedToArn, role: planned.assignedToRole }
    : null;
  if (!dueDate) {
    return { dueDate: null, status: groundSchoolIncomplete ? 'in_training' : 'overdue', completedDate: completed, plannedDate, plannedAssignedTo };
  }
  return { dueDate: dueDate.toISOString(), status: statusFor(dueDate), completedDate: completed, plannedDate, plannedAssignedTo };
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
    'SELECT check_key, planned_date, assigned_to, assigned_to_name, assigned_to_arn, assigned_to_role FROM crew_planned_checks WHERE crew_member_id = $1',
    [crewMemberId],
  );
  return Object.fromEntries(rows.map((r) => [r.check_key, {
    plannedDate: r.planned_date,
    assignedTo: r.assigned_to,
    assignedToName: r.assigned_to_name,
    assignedToArn: r.assigned_to_arn,
    assignedToRole: r.assigned_to_role,
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
  return status === 'overdue' || status === 'due_soon' || status === 'not_completed';
}

// Shared by urgentItemsFor (below, filtered to just what needs attention)
// and allItemsFor (Currency Overview's "show me everyone" view) - both
// agree on the same underlying item list, just with a different filter
// applied afterwards.
// Refresher Training isn't required until a pilot's first Line Check (365
// days after their Check to Line/line_check_anchor_date) - a freshly
// promoted pilot with no Refresher Training date set yet shouldn't show as
// already needing it. Mirrors pilotLineCheckDue's own anchor logic; only
// kicks in when nothing has actually been entered against it yet (a real
// completed/due date always wins).
function withRefresherDefaultDue(member, name, dueDate) {
  if (name === 'Refresher Training' && !dueDate && member.type === 'PILOT' && member.lineCheckAnchorDate) {
    return addDays(new Date(member.lineCheckAnchorDate), 365);
  }
  return dueDate;
}

async function itemsFor(member, currency) {
  const fromCurrency = Object.entries(currency)
    .filter(([, info]) => !!info)
    .map(([key, info]) => ({
      label: CURRENCY_LABELS[key] || key,
      status: info.status,
      dueDate: info.dueDate,
      completedDate: info.completedDate,
      plannedDate: info.plannedDate,
    }));

  const competencies = await activeCompetencies(member.id, member.type, member.fleets);
  const fromCompetencies = competencies
    .filter((c) => !c.na)
    .map((c) => {
      const dueDate = withRefresherDefaultDue(member, c.name, c.due_date);
      return {
        label: c.name,
        status: competencyStatus(dueDate),
        dueDate,
        completedDate: c.completed_date,
        plannedDate: c.planned_date,
      };
    });

  return [...fromCurrency, ...fromCompetencies];
}

async function urgentItemsFor(member, currency) {
  const items = await itemsFor(member, currency);
  return items.filter((i) => isUrgent(i.status));
}

// Every recurrent check and competency, whatever its status - Currency
// Overview shows the whole roster's picture (not just problems) so
// "everything's fine" is as visible as "this is overdue".
async function allItemsFor(member, currency) {
  return itemsFor(member, currency);
}

async function withCurrency(member) {
  const planned = await plannedDatesFor(member.id);
  let currency;

  if (member.type === 'PILOT') {
    const [epChk, ipcChk, pcChk, lineCheckCount, lastLineCheckChk, groundSchoolIncomplete] = await Promise.all([
      lastCompletedCheck(member.id, 'EMERGENCY_PROCEDURES'),
      lastCompletedCheck(member.id, 'RECURRENT_SIMULATOR', 'IPC_PC'),
      lastCompletedCheck(member.id, 'RECURRENT_SIMULATOR', 'PC'),
      completedPilotLineCheckCount(member.id),
      lastCompletedCheck(member.id, 'PILOT_LINE_CHECK'),
      hasIncompleteGroundSchool(member.traineeId),
    ]);
    const ep = latestOf(epChk, member.seedEpDate);
    const ipc = latestOf(ipcChk, member.seedIpcDate);
    // An IPC's requirements cover a Proficiency Check too (it includes a
    // licence reissue on top of what a PC alone would test), so completing
    // one resets the PC's 365-day clock as well - not just a dedicated
    // PC-variant check. The reverse doesn't hold: a plain PC doesn't touch
    // the IPC's own due date above.
    const pc = latestOf(latestOf(pcChk, ipcChk), member.seedPcDate);
    currency = {
      emergencyProcedures: dueInfo(nextDueRolling(ep), ep, planned.emergencyProcedures, groundSchoolIncomplete),
      ipc: dueInfo(nextDueRolling(ipc), ipc, planned.ipc, groundSchoolIncomplete),
      proficiencyCheck: dueInfo(nextDueRolling(pc), pc, planned.proficiencyCheck, groundSchoolIncomplete),
      // Falls back to the initial Check to Line anchor date when no
      // recurrent Line Check has ever been completed yet. If there's no
      // anchor at all (e.g. a crew profile onboarded without one) but a
      // Line Check has genuinely been completed, that fixed-anniversary
      // calculation has nothing to work from and returns null - fall back
      // to a rolling 365 days from the last completion instead (same rule
      // EP/IPC/PC already use), rather than leaving them stuck reading
      // "never completed" forever despite a real completed check on file.
      lineCheck: dueInfo(pilotLineCheckDue(member.lineCheckAnchorDate, lineCheckCount) || nextDueRolling(lastLineCheckChk), lastLineCheckChk || member.lineCheckAnchorDate, planned.lineCheck, groundSchoolIncomplete),
    };
  } else {
    const [epChk, lineCheckChk] = await Promise.all([
      lastCompletedCheck(member.id, 'EMERGENCY_PROCEDURES'),
      lastCompletedCheck(member.id, 'CABIN_ATTENDANT_LINE_CHECK'),
    ]);
    const ep = latestOf(epChk, member.seedEpDate);
    const lineCheck = latestOf(lineCheckChk, member.seedLineCheckDate);
    currency = {
      emergencyProcedures: dueInfo(nextDueRolling(ep), ep, planned.emergencyProcedures),
      lineCheck: dueInfo(nextDueRolling(lineCheck), lineCheck, planned.lineCheck),
    };
  }

  return {
    ...member,
    currency,
    urgentItems: await urgentItemsFor(member, currency),
    allItems: await allItemsFor(member, currency),
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

router.post('/', blockCaManager, async (req, res) => {
  const parsed = quickAddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const fleetError = fleetOrderError(d.type, d.fleets);
  if (fleetError) return res.status(400).json({ error: fleetError });

  let rows;
  try {
    ({ rows } = await pool.query(
      `INSERT INTO crew_members (first_name, last_name, type, role, fleets, line_check_anchor_date, seed_ep_date, seed_ipc_date, seed_pc_date, seed_line_check_date, user_id, arn, licence_photo, syllabus_id)
       VALUES ($1, $2, $3, $4, $5::fleet[], $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
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
      ],
    ));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That staff account is already linked to another crew profile' });
    throw err;
  }
  const member = serializeCrewMember(rows[0]);

  if (d.newHire) {
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
  res.status(201).json(await withCurrency(member));
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
};
const CAST_MAP = { fleets: '::fleet[]' };

router.patch('/:id', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (forbiddenForCaManager(req, member)) return res.status(403).json({ error: 'Forbidden' });
  if (!assertNotArchived(member, res)) return;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

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

const plannedCheckSchema = z.object({
  plannedDate: z.string().nullable(),
  assignedTo: z.string().uuid().nullable().optional(),
});

router.put('/:id/planned-checks/:checkKey', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (forbiddenForCaManager(req, member)) return res.status(403).json({ error: 'Forbidden' });
  if (!assertNotArchived(member, res)) return;
  if (!PLANNED_CHECK_KEYS.includes(req.params.checkKey)) return res.status(400).json({ error: 'Invalid check' });

  const parsed = plannedCheckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { plannedDate } = parsed.data;
  // Distinguish "assignedTo not sent, leave as-is" from "assignedTo: null,
  // unassign" - mirrors checks.js/ctl.js's own assignee-patch handling.
  const hasAssignedTo = Object.prototype.hasOwnProperty.call(req.body, 'assignedTo');

  if (!plannedDate) {
    await pool.query('DELETE FROM crew_planned_checks WHERE crew_member_id = $1 AND check_key = $2', [member.id, req.params.checkKey]);
  } else {
    const assignee = hasAssignedTo
      ? await resolveAssignee(parsed.data.assignedTo)
      : { assignedToName: null, assignedToArn: null, assignedToRole: null };
    await pool.query(
      `INSERT INTO crew_planned_checks (crew_member_id, check_key, planned_date, assigned_to, assigned_to_name, assigned_to_arn, assigned_to_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (crew_member_id, check_key) DO UPDATE SET
         planned_date = $3,
         assigned_to = CASE WHEN $8 THEN $4::uuid ELSE crew_planned_checks.assigned_to END,
         assigned_to_name = CASE WHEN $8 THEN $5 ELSE crew_planned_checks.assigned_to_name END,
         assigned_to_arn = CASE WHEN $8 THEN $6 ELSE crew_planned_checks.assigned_to_arn END,
         assigned_to_role = CASE WHEN $8 THEN $7 ELSE crew_planned_checks.assigned_to_role END`,
      [
        member.id, req.params.checkKey, plannedDate,
        hasAssignedTo ? (parsed.data.assignedTo || null) : null,
        assignee.assignedToName, assignee.assignedToArn, assignee.assignedToRole,
        hasAssignedTo,
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

  const { rows } = await pool.query(
    `SELECT ct.id AS competency_type_id, ct.name, cc.completed_date, cc.due_date, cc.planned_date, COALESCE(cc.na, false) AS na, COALESCE(cc.course_sent, false) AS course_sent
     FROM competency_types ct
     LEFT JOIN crew_competencies cc ON cc.competency_type_id = ct.id AND cc.crew_member_id = $1
     WHERE ct.archived = false AND (ct.applies_to IS NULL OR ct.applies_to = $2)
       AND (ct.fleets IS NULL OR ct.fleets && $3::fleet[])
       AND (ct.staff_roles IS NULL OR EXISTS (
         SELECT 1 FROM crew_members cm JOIN users u ON u.id = cm.user_id WHERE cm.id = $1 AND u.role = ANY(ct.staff_roles)
       ))
     ORDER BY ct.sort_order ASC, ct.created_at ASC`,
    [member.id, member.type, member.fleets],
  );
  res.json(rows.map(rowToCamel).map((c) => ({ ...c, dueDate: withRefresherDefaultDue(member, c.name, c.dueDate) })));
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
