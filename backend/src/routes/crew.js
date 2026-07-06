const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { nextDueRolling, pcWindow, pilotLineCheckDue, statusFor } = require('../lib/currency');

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
// links to one, their name and fleets are read live from the users table
// instead of the crew member's own (possibly stale) copies, so an
// amendment on the Staff page carries straight over without re-entry.
const CREW_SELECT = `
  SELECT crew_members.*, u.name AS linked_user_name, u.fleets AS linked_user_fleets
  FROM crew_members
  LEFT JOIN users u ON u.id = crew_members.user_id
`;

function serializeCrewMember(row) {
  const m = rowToCamel(row);
  const isLinked = !!m.userId;
  const { linkedUserName, linkedUserFleets, ...rest } = m;
  return {
    ...rest,
    fleets: isLinked ? parsePgArray(linkedUserFleets) : parsePgArray(rest.fleets),
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

function dueInfo(dueDate, completedDate, plannedDate, opts) {
  const completed = completedDate ? new Date(completedDate).toISOString() : null;
  const planned = plannedDate ? new Date(plannedDate).toISOString() : null;
  if (!dueDate) return { dueDate: null, status: 'overdue', completedDate: completed, plannedDate: planned };
  return { dueDate: dueDate.toISOString(), status: statusFor(dueDate, opts), completedDate: completed, plannedDate: planned };
}

// HOTC/HOFO/Flight Ops Admin can note a planned date for an upcoming check
// (e.g. "PC booked for 15 Aug") before it's actually conducted - purely
// informational, shown alongside the computed due date on Currency
// Overview and the crew member's own profile.
const PLANNED_CHECK_KEYS = ['emergencyProcedures', 'ipc', 'proficiencyCheck', 'lineCheck'];

async function plannedDatesFor(crewMemberId) {
  const { rows } = await pool.query(
    'SELECT check_key, planned_date FROM crew_planned_checks WHERE crew_member_id = $1',
    [crewMemberId],
  );
  return Object.fromEntries(rows.map((r) => [r.check_key, r.planned_date]));
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

async function withCurrency(member) {
  const planned = await plannedDatesFor(member.id);

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
    const pc = latestOf(pcChk, member.seedPcDate);
    const pcWin = pcWindow(pc);
    return {
      ...member,
      currency: {
        emergencyProcedures: dueInfo(nextDueRolling(ep), ep, planned.emergencyProcedures),
        ipc: dueInfo(nextDueRolling(ipc), ipc, planned.ipc),
        proficiencyCheck: pcWin
          ? dueInfo(pcWin.targetDue, pc, planned.proficiencyCheck, { hardExpiry: pcWin.hardExpiry })
          : dueInfo(null, pc, planned.proficiencyCheck),
        // Falls back to the initial Check to Line anchor date when no
        // recurrent Line Check has ever been completed yet.
        lineCheck: dueInfo(pilotLineCheckDue(member.lineCheckAnchorDate, lineCheckCount), lastLineCheckChk || member.lineCheckAnchorDate, planned.lineCheck),
      },
    };
  }

  const [epChk, lineCheckChk] = await Promise.all([
    lastCompletedCheck(member.id, 'EMERGENCY_PROCEDURES'),
    lastCompletedCheck(member.id, 'CABIN_ATTENDANT_LINE_CHECK'),
  ]);
  const ep = latestOf(epChk, member.seedEpDate);
  const lineCheck = latestOf(lineCheckChk, member.seedLineCheckDate);
  return {
    ...member,
    currency: {
      emergencyProcedures: dueInfo(nextDueRolling(ep), ep, planned.emergencyProcedures),
      lineCheck: dueInfo(nextDueRolling(lineCheck), lineCheck, planned.lineCheck),
    },
  };
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
  // member's name/fleets are then read live from Staff.
  userId: z.string().uuid().nullable().optional(),
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
      `INSERT INTO crew_members (first_name, last_name, type, role, fleets, line_check_anchor_date, seed_ep_date, seed_ipc_date, seed_pc_date, seed_line_check_date, user_id)
       VALUES ($1, $2, $3, $4, $5::fleet[], $6, $7, $8, $9, $10, $11) RETURNING *`,
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
      ],
    ));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That staff account is already linked to another crew profile' });
    throw err;
  }
  const member = serializeCrewMember(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'crew_members', targetId: member.id });
  res.status(201).json(await withCurrency(member));
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT']).optional(),
  fleets: z.array(z.enum(FLEET_VALUES)).min(1).optional(),
  lineCheckAnchorDate: z.string().nullable().optional(),
  // Links this crew profile to an existing staff account (see CREW_SELECT)
  // so name/fleets are read live from Staff instead of drifting out of sync.
  userId: z.string().uuid().nullable().optional(),
});

const COLUMN_MAP = {
  firstName: 'first_name',
  lastName: 'last_name',
  role: 'role',
  fleets: 'fleets',
  lineCheckAnchorDate: 'line_check_anchor_date',
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

const plannedCheckSchema = z.object({ plannedDate: z.string().nullable() });

router.put('/:id/planned-checks/:checkKey', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });
  if (!PLANNED_CHECK_KEYS.includes(req.params.checkKey)) return res.status(400).json({ error: 'Invalid check' });

  const parsed = plannedCheckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { plannedDate } = parsed.data;

  if (!plannedDate) {
    await pool.query('DELETE FROM crew_planned_checks WHERE crew_member_id = $1 AND check_key = $2', [member.id, req.params.checkKey]);
  } else {
    await pool.query(
      `INSERT INTO crew_planned_checks (crew_member_id, check_key, planned_date) VALUES ($1, $2, $3)
       ON CONFLICT (crew_member_id, check_key) DO UPDATE SET planned_date = $3`,
      [member.id, req.params.checkKey, plannedDate],
    );
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

// Ad-hoc competencies (e.g. Dangerous Goods, run by an external provider) -
// just a name, a completion date and a due date, tracked separately from
// the fixed recurrent-check types above.
router.get('/:id/competencies', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });

  const { rows } = await pool.query(
    'SELECT * FROM crew_competencies WHERE crew_member_id = $1 AND archived = $2 ORDER BY due_date ASC NULLS LAST',
    [member.id, req.query.archived === 'true'],
  );
  res.json(rows.map(rowToCamel));
});

const competencySchema = z.object({
  name: z.string().min(1),
  completedDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  plannedDate: z.string().nullable().optional(),
});

router.post('/:id/competencies', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });

  const parsed = competencySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, completedDate, dueDate, plannedDate } = parsed.data;

  const { rows } = await pool.query(
    `INSERT INTO crew_competencies (crew_member_id, name, completed_date, due_date, planned_date) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [member.id, name, completedDate || null, dueDate || null, plannedDate || null],
  );
  const competency = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'crew_competencies', targetId: competency.id });
  res.status(201).json(competency);
});

const competencyUpdateSchema = competencySchema.partial();
const COMPETENCY_COLUMN_MAP = { name: 'name', completedDate: 'completed_date', dueDate: 'due_date', plannedDate: 'planned_date' };

router.patch('/:id/competencies/:competencyId', async (req, res) => {
  const parsed = competencyUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${COMPETENCY_COLUMN_MAP[key]} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id, req.params.competencyId);

  const { rows } = await pool.query(
    `UPDATE crew_competencies SET ${setClauses.join(', ')}
     WHERE crew_member_id = $${values.length - 1} AND id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'crew_competencies', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

router.post('/:id/competencies/:competencyId/archive', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE crew_competencies SET archived = true, archived_at = now() WHERE crew_member_id = $1 AND id = $2 RETURNING *',
    [req.params.id, req.params.competencyId],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'crew_competencies', targetId: req.params.competencyId });
  res.json(rowToCamel(rows[0]));
});

router.post('/:id/competencies/:competencyId/unarchive', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE crew_competencies SET archived = false, archived_at = null WHERE crew_member_id = $1 AND id = $2 RETURNING *',
    [req.params.id, req.params.competencyId],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'crew_competencies', targetId: req.params.competencyId });
  res.json(rowToCamel(rows[0]));
});

module.exports = router;
