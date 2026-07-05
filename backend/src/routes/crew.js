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

function serializeCrewMember(row) {
  const m = rowToCamel(row);
  return { ...m, fleets: parsePgArray(m.fleets) };
}

async function findCrewMember(id) {
  const { rows } = await pool.query('SELECT * FROM crew_members WHERE id = $1', [id]);
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

function dueInfo(dueDate, opts) {
  if (!dueDate) return { dueDate: null, status: 'overdue' };
  return { dueDate: dueDate.toISOString(), status: statusFor(dueDate, opts) };
}

async function withCurrency(member) {
  if (member.type === 'PILOT') {
    const [ep, ipc, pc, lineCheckCount] = await Promise.all([
      lastCompletedCheck(member.id, 'EMERGENCY_PROCEDURES'),
      lastCompletedCheck(member.id, 'RECURRENT_SIMULATOR', 'IPC_PC'),
      lastCompletedCheck(member.id, 'RECURRENT_SIMULATOR', 'PC'),
      completedPilotLineCheckCount(member.id),
    ]);
    const pcWin = pcWindow(pc);
    return {
      ...member,
      currency: {
        emergencyProcedures: dueInfo(nextDueRolling(ep)),
        ipc: dueInfo(nextDueRolling(ipc)),
        proficiencyCheck: pcWin ? dueInfo(pcWin.targetDue, { hardExpiry: pcWin.hardExpiry }) : dueInfo(null),
        lineCheck: dueInfo(pilotLineCheckDue(member.lineCheckAnchorDate, lineCheckCount)),
      },
    };
  }

  const [ep, lineCheck] = await Promise.all([
    lastCompletedCheck(member.id, 'EMERGENCY_PROCEDURES'),
    lastCompletedCheck(member.id, 'CABIN_ATTENDANT_LINE_CHECK'),
  ]);
  return {
    ...member,
    currency: {
      emergencyProcedures: dueInfo(nextDueRolling(ep)),
      lineCheck: dueInfo(nextDueRolling(lineCheck)),
    },
  };
}

router.get('/', async (req, res) => {
  const { type, archived } = req.query;
  const conditions = ['archived = $1'];
  const params = [archived === 'true'];
  if (type) { params.push(type); conditions.push(`type = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT * FROM crew_members WHERE ${conditions.join(' AND ')} ORDER BY last_name ASC`,
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
  // Seed dates - each (other than the pilot Line Check anchor) becomes an
  // ordinary completed check row so the same due-date queries above pick it
  // up like any other check would.
  lastEpDate: z.string().optional(),
  lastIpcDate: z.string().optional(),
  lastPcDate: z.string().optional(),
  lineCheckAnchorDate: z.string().optional(),
  lastLineCheckDate: z.string().optional(),
});

router.post('/', async (req, res) => {
  const parsed = quickAddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const fleetError = fleetOrderError(d.type, d.fleets);
  if (fleetError) return res.status(400).json({ error: fleetError });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crew_members (first_name, last_name, type, role, fleets, line_check_anchor_date)
       VALUES ($1, $2, $3, $4, $5::fleet[], $6) RETURNING *`,
      [d.firstName, d.lastName, d.type, d.role, d.fleets, d.type === 'PILOT' ? (d.lineCheckAnchorDate || null) : null],
    );
    const member = serializeCrewMember(rows[0]);
    const name = `${d.firstName} ${d.lastName}`;

    async function seed(checkType, completedAt, variant) {
      if (!completedAt) return;
      await client.query(
        `INSERT INTO checks (crew_member_id, crew_member_name, check_type, applies_to, result, completed_at, details)
         VALUES ($1, $2, $3, $4, 'PASS', $5, $6)`,
        [member.id, name, checkType, d.type, completedAt, JSON.stringify(variant ? { name, variant } : { name })],
      );
    }

    if (d.type === 'PILOT') {
      await seed('EMERGENCY_PROCEDURES', d.lastEpDate);
      await seed('RECURRENT_SIMULATOR', d.lastIpcDate, 'IPC_PC');
      await seed('RECURRENT_SIMULATOR', d.lastPcDate, 'PC');
    } else {
      await seed('EMERGENCY_PROCEDURES', d.lastEpDate);
      await seed('CABIN_ATTENDANT_LINE_CHECK', d.lastLineCheckDate);
    }

    await client.query('COMMIT');
    await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'crew_members', targetId: member.id });
    res.status(201).json(await withCurrency(member));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT']).optional(),
  fleets: z.array(z.enum(FLEET_VALUES)).min(1).optional(),
  lineCheckAnchorDate: z.string().nullable().optional(),
});

const COLUMN_MAP = {
  firstName: 'first_name',
  lastName: 'last_name',
  role: 'role',
  fleets: 'fleets',
  lineCheckAnchorDate: 'line_check_anchor_date',
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

  const { rows } = await pool.query(
    `UPDATE crew_members SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'crew_members', targetId: member.id });
  res.json(await withCurrency(serializeCrewMember(rows[0])));
});

router.post('/:id/archive', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE crew_members SET archived = true, archived_at = now() WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'crew_members', targetId: req.params.id });
  res.json(serializeCrewMember(rows[0]));
});

router.post('/:id/unarchive', async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE crew_members SET archived = false, archived_at = null WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'crew_members', targetId: req.params.id });
  res.json(serializeCrewMember(rows[0]));
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
});

router.post('/:id/competencies', async (req, res) => {
  const member = await findCrewMember(req.params.id);
  if (!member) return res.status(404).json({ error: 'Not found' });

  const parsed = competencySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, completedDate, dueDate } = parsed.data;

  const { rows } = await pool.query(
    `INSERT INTO crew_competencies (crew_member_id, name, completed_date, due_date) VALUES ($1, $2, $3, $4) RETURNING *`,
    [member.id, name, completedDate || null, dueDate || null],
  );
  const competency = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'crew_competencies', targetId: competency.id });
  res.status(201).json(competency);
});

const competencyUpdateSchema = competencySchema.partial();
const COMPETENCY_COLUMN_MAP = { name: 'name', completedDate: 'completed_date', dueDate: 'due_date' };

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
