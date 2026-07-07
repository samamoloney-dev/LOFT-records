const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { resolveAssignee } = require('../lib/assignee');
const { nextDueRolling, pilotLineCheckDue, statusFor, competencyStatus } = require('../lib/currency');
const { createCheckRecord } = require('./checks');

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

// Cabin attendants start qualified on Dash 8 and can only add Fokker 100
// once they hold Dash 8 (a real-world conversion-course requirement, not a
// check type this app tracks) - pilots aren't constrained this way.
function fleetOrderError(type, fleets) {
  if (type === 'CABIN_ATTENDANT' && fleets.includes('CA_FOKKER_100') && !fleets.includes('CA_DASH_8')) {
    return 'Cabin attendants must be qualified on Dash 8 before Fokker 100 can be added';
  }
  return null;
}

const router = express.Router();

// Crew (already-qualified line pilots/cabin attendants, tracked for
// recurrency) is a separate concept from trainees (people going through
// initial qualification) - see 0018 migration comment. Restricted to
// HOTC/HOFO/Flight Ops Admin for now, same as Staff/Archive.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

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
  SELECT crew_members.*, u.name AS linked_user_name
  FROM crew_members
  LEFT JOIN users u ON u.id = crew_members.user_id
`;

function serializeCrewMember(row) {
  const m = rowToCamel(row);
  const isLinked = !!m.userId;
  const { linkedUserName, ...rest } = m;
  return {
    ...rest,
    fleets: parsePgArray(rest.fleets),
    name: isLinked ? linkedUserName : `${rest.firstName} ${rest.lastName}`,
    isLinked,
  };
}

async function findCrewMember(id) {
  const { rows } = await pool.query(`${CREW_SELECT} WHERE crew_members.id = $1`, [id]);
  return rows[0] ? serializeCrewMember(rows[0]) : null;
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

function dueInfo(dueDate, completedDate, planned) {
  const completed = completedDate ? new Date(completedDate).toISOString() : null;
  const plannedDate = planned?.plannedDate ? new Date(planned.plannedDate).toISOString() : null;
  const plannedAssignedTo = planned?.assignedToName
    ? { id: planned.assignedTo, name: planned.assignedToName, arn: planned.assignedToArn, role: planned.assignedToRole }
    : null;
  if (!dueDate) return { dueDate: null, status: 'overdue', completedDate: completed, plannedDate, plannedAssignedTo };
  return { dueDate: dueDate.toISOString(), status: statusFor(dueDate), completedDate: completed, plannedDate, plannedAssignedTo };
}

// HOTC/HOFO/Flight Ops Admin can note a planned date for an upcoming check
// (e.g. "PC booked for 15 Aug") before it's actually conducted, optionally
// with an examiner/instructor/check pilot already assigned (see the new
// Planning page) - purely informational, shown alongside the computed due
// date on Currency Overview and the crew member's own profile, and used to
// prefill the assignee when the real check is later created.
const PLANNED_CHECK_KEYS = ['emergencyProcedures', 'ipc', 'proficiencyCheck', 'lineCheck'];

// Maps a planned-check key to what the real check record needs once it's
// auto-created (see the planned-checks PUT handler below): the checks.check_type
// value, and - for RECURRENT_SIMULATOR, which covers both PC and IPC under
// one checkType - the details.variant ProficiencyChecks.jsx filters on.
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
async function activeCompetencies(crewMemberId) {
  const { rows } = await pool.query(
    `SELECT ct.name, cc.due_date, cc.planned_date, cc.completed_date, COALESCE(cc.na, false) AS na
     FROM competency_types ct
     LEFT JOIN crew_competencies cc ON cc.competency_type_id = ct.id AND cc.crew_member_id = $1
     WHERE ct.archived = false`,
    [crewMemberId],
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
  return status === 'overdue' || status === 'due_soon';
}

async function urgentItemsFor(member, currency) {
  const fromCurrency = Object.entries(currency)
    .filter(([, info]) => info && isUrgent(info.status))
    .map(([key, info]) => ({
      label: CURRENCY_LABELS[key] || key,
      status: info.status,
      dueDate: info.dueDate,
      completedDate: info.completedDate,
      plannedDate: info.plannedDate,
    }));

  const competencies = await activeCompetencies(member.id);
  const fromCompetencies = competencies
    .filter((c) => !c.na)
    .map((c) => ({
      label: c.name,
      status: competencyStatus(c.due_date),
      dueDate: c.due_date,
      completedDate: c.completed_date,
      plannedDate: c.planned_date,
    }))
    .filter((c) => isUrgent(c.status));

  return [...fromCurrency, ...fromCompetencies];
}

async function withCurrency(member) {
  const planned = await plannedDatesFor(member.id);
  let currency;

  if (member.type === 'PILOT') {
    const [epChk, ipcChk, pcChk, lineCheckCount, lastLineCheckChk] = await Promise.all([
      lastCompletedCheck(member.id, 'EMERGENCY_PROCEDURES'),
      lastCompletedCheck(member.id, 'RECURRENT_SIMULATOR', 'IPC_PC'),
      lastCompletedCheck(member.id, 'RECURRENT_SIMULATOR', 'PC'),
      completedPilotLineCheckCount(member.id),
      lastCompletedCheck(member.id, 'PILOT_LINE_CHECK'),
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
      emergencyProcedures: dueInfo(nextDueRolling(ep), ep, planned.emergencyProcedures),
      ipc: dueInfo(nextDueRolling(ipc), ipc, planned.ipc),
      proficiencyCheck: dueInfo(nextDueRolling(pc), pc, planned.proficiencyCheck),
      // Falls back to the initial Check to Line anchor date when no
      // recurrent Line Check has ever been completed yet.
      lineCheck: dueInfo(pilotLineCheckDue(member.lineCheckAnchorDate, lineCheckCount), lastLineCheckChk || member.lineCheckAnchorDate, planned.lineCheck),
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

  return { ...member, currency, urgentItems: await urgentItemsFor(member, currency) };
}

router.get('/', async (req, res) => {
  const { type, archived } = req.query;
  const conditions = ['crew_members.archived = $1'];
  const params = [archived === 'true'];
  if (type) { params.push(type); conditions.push(`crew_members.type = $${params.length}`); }

  const { rows } = await pool.query(
    `${CREW_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY crew_members.last_name ASC`,
    params,
  );
  const members = await Promise.all(rows.map(serializeCrewMember).map(withCurrency));
  res.json(members);
});

router.get('/:id', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
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
}).superRefine((d, ctx) => {
  if (d.type === 'PILOT' && !d.arn?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['arn'], message: 'ARN is required for pilots' });
  }
});

router.post('/', async (req, res) => {
  const parsed = quickAddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const fleetError = fleetOrderError(d.type, d.fleets);
  if (fleetError) return res.status(400).json({ error: fleetError });

  let rows;
  try {
    ({ rows } = await pool.query(
      `INSERT INTO crew_members (first_name, last_name, type, role, fleets, line_check_anchor_date, seed_ep_date, seed_ipc_date, seed_pc_date, seed_line_check_date, user_id, arn)
       VALUES ($1, $2, $3, $4, $5::fleet[], $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
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
    // profile (which just tracks their ongoing recurrent currency). Best
    // effort - if this fails, the crew member is still created; the admin
    // can add the trainee record by hand from the Trainees tab instead.
    try {
      await pool.query(
        `INSERT INTO trainees (first_name, last_name, type, role, fleet, phase) VALUES ($1, $2, $3, $4, $5, 1)`,
        [d.firstName, d.lastName, d.type, d.role, d.fleets[0]],
      );
    } catch (err) {
      // Swallow - the crew profile creation above already succeeded and
      // is the primary outcome of this request.
    }
  }

  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'crew_members', targetId: member.id });
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
});

const COLUMN_MAP = {
  firstName: 'first_name',
  lastName: 'last_name',
  role: 'role',
  fleets: 'fleets',
  lineCheckAnchorDate: 'line_check_anchor_date',
  arn: 'arn',
  userId: 'user_id',
};
const CAST_MAP = { fleets: '::fleet[]' };

router.patch('/:id', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });

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

    // Setting a planned date used to only prefill the assignee once someone
    // later clicked "Add check" by hand - now it creates the actual
    // (incomplete) check record right away, so it shows up on the relevant
    // Checks page immediately. Skipped if one's already in progress for
    // this crew member/check type, so re-editing the planned date or
    // assignee doesn't spawn duplicates.
    const { checkType, variant } = CHECK_KEY_TO_CHECK_TYPE[req.params.checkKey](member.type);
    const { rows: existingChecks } = await pool.query(
      `SELECT id FROM checks WHERE crew_member_id = $1 AND check_type = $2 AND completed_at IS NULL
       AND ($3::text IS NULL OR details->>'variant' = $3)`,
      [member.id, checkType, variant || null],
    );
    if (existingChecks.length === 0) {
      const singleFleet = member.fleets?.length === 1 ? member.fleets[0] : undefined;
      // plannedDate can arrive as a full ISO timestamp (crew_planned_checks.planned_date
      // comes back from Postgres as a Date object, which the Planning tab's
      // "assign examiner" action then echoes straight back) - normalize to a
      // plain YYYY-MM-DD before it lands in details.date, which check forms
      // display as-is with no further formatting.
      const dateOnly = new Date(plannedDate).toISOString().slice(0, 10);
      await createCheckRecord({
        crewMemberId: member.id,
        checkType,
        fleet: singleFleet,
        appliesTo: member.type,
        assignedTo: hasAssignedTo ? (parsed.data.assignedTo || null) : null,
        details: {
          name: member.name,
          role: member.role,
          arn: member.arn,
          date: dateOnly,
          actype: singleFleet ? FLEET_TO_AIRCRAFT_TYPE[singleFleet] : undefined,
          ...(variant ? { variant } : {}),
        },
      });
    }
  }
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'crew_planned_checks', targetId: member.id });
  res.json(await withCurrency(member));
});

router.post('/:id/archive', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE crew_members SET archived = true, archived_at = now() WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'crew_members', targetId: req.params.id });
  res.json(await findCrewMember(req.params.id));
});

router.post('/:id/unarchive', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE crew_members SET archived = false, archived_at = null WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'crew_members', targetId: req.params.id });
  res.json(await findCrewMember(req.params.id));
});

// Every active competency type (managed on the Syllabus tab - see
// competency-types.js) is required for every crew member, so this always
// returns one row per active type rather than needing them added one at a
// time - dates just get filled in against whichever ones apply.
router.get('/:id/competencies', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });

  const { rows } = await pool.query(
    `SELECT ct.id AS competency_type_id, ct.name, cc.completed_date, cc.due_date, cc.planned_date, COALESCE(cc.na, false) AS na, COALESCE(cc.course_sent, false) AS course_sent
     FROM competency_types ct
     LEFT JOIN crew_competencies cc ON cc.competency_type_id = ct.id AND cc.crew_member_id = $1
     WHERE ct.archived = false
     ORDER BY ct.sort_order ASC, ct.created_at ASC`,
    [member.id],
  );
  res.json(rows.map(rowToCamel));
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

  const parsed = competencyDatesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { completedDate, dueDate, plannedDate, na, courseSent } = parsed.data;

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

module.exports = router;
