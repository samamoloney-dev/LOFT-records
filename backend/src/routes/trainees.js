const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, canAccessArchived, isCaOnlyRole, isAdmin, ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  type: z.enum(['PILOT', 'CABIN_ATTENDANT']),
  role: z.enum(['CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT']),
  fleet: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']),
  phase: z.number().int().min(1).optional(),
});

async function withHours(trainee) {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(hours), 0) AS total_hours FROM flights WHERE trainee_id = $1',
    [trainee.id],
  );
  return { ...trainee, totalHours: Number(rows[0].total_hours) };
}

async function findTrainee(id) {
  const { rows } = await pool.query('SELECT * FROM trainees WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  const includeArchived = req.query.archived === 'true';
  if (includeArchived && !canAccessArchived(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const conditions = ['archived = $1'];
  const params = [includeArchived];
  if (isCaOnlyRole(req.user)) {
    conditions.push(`type = $${params.length + 1}`);
    params.push('CABIN_ATTENDANT');
  }

  const { rows } = await pool.query(
    `SELECT * FROM trainees WHERE ${conditions.join(' AND ')} ORDER BY last_name ASC`,
    params,
  );
  const trainees = rows.map(rowToCamel);
  const withTotals = await Promise.all(trainees.map(withHours));
  res.json(withTotals);
});

router.get('/:id', async (req, res) => {
  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });
  if (trainee.archived && !canAccessArchived(req.user)) return res.status(403).json({ error: 'Forbidden' });

  res.json(await withHours(trainee));
});

// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new trainee -
// no other staff role, per the operator's explicit rule.
router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { firstName, lastName, type, role, fleet, phase } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO trainees (first_name, last_name, type, role, fleet, phase)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [firstName, lastName, type, role, fleet, phase || 1],
  );
  const trainee = rowToCamel(rows[0]);
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'trainees', targetId: trainee.id,
    description: `Added trainee ${trainee.firstName} ${trainee.lastName}`,
  });
  res.status(201).json(await withHours(trainee));
});

const COLUMN_MAP = {
  firstName: 'first_name',
  lastName: 'last_name',
  type: 'type',
  role: 'role',
  fleet: 'fleet',
  phase: 'phase',
};

router.patch('/:id', async (req, res) => {
  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = createSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.json(await withHours(trainee));

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE trainees SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'trainees', targetId: trainee.id });
  res.json(await withHours(rowToCamel(rows[0])));
});

// Once a trainee's Check to Line is complete, they can move onto the Crew
// roster (the ongoing recurrency-tracking system) without re-typing their
// name/fleet/role. For pilots, the CTL completion date becomes their fixed
// Line Check anniversary going forward.
router.post('/:id/promote-to-crew', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can add crew' });

  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const { rows: ctlRows } = await pool.query('SELECT completed_at FROM check_to_line_forms WHERE trainee_id = $1', [trainee.id]);
  if (ctlRows.length === 0 || !ctlRows[0].completed_at) {
    return res.status(400).json({ error: 'Check to Line must be completed before adding this trainee to the Crew roster' });
  }

  const client = await pool.connect();
  let crewMember;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crew_members (first_name, last_name, type, role, fleets, line_check_anchor_date)
       VALUES ($1, $2, $3, $4, $5::fleet[], $6) RETURNING *`,
      [
        trainee.firstName,
        trainee.lastName,
        trainee.type,
        trainee.role,
        [trainee.fleet],
        trainee.type === 'PILOT' ? ctlRows[0].completed_at : null,
      ],
    );
    // The trainee record becomes redundant once they're on the Crew roster -
    // archive it now rather than at Check to Line completion time, so the
    // trainee stays visible/active right up until this point.
    await client.query('UPDATE trainees SET archived = true, archived_at = now() WHERE id = $1', [trainee.id]);
    await client.query('COMMIT');
    crewMember = { ...rowToCamel(rows[0]), fleets: parsePgArray(rows[0].fleets) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await logAction({
    userId: req.user.id, action: 'PROMOTE_TO_CREW', targetTable: 'crew_members', targetId: crewMember.id,
    description: `Promoted ${crewMember.firstName} ${crewMember.lastName} to the Crew roster`,
  });
  res.status(201).json(crewMember);
});

// A trainee who withdraws or otherwise stops training needs a way out of
// the active list that isn't tied to Check to Line completion (the only
// other path to archived - see promote-to-crew above) - mirrors crew_members'
// own archive/unarchive pair.
router.post('/:id/archive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can archive trainees' });
  const { rows } = await pool.query(
    'UPDATE trainees SET archived = true, archived_at = now() WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'ARCHIVE', targetTable: 'trainees', targetId: req.params.id,
    description: `Archived trainee ${rows[0].first_name} ${rows[0].last_name}`,
  });
  res.json(await withHours(rowToCamel(rows[0])));
});

router.post('/:id/unarchive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can unarchive trainees' });
  const { rows } = await pool.query(
    'UPDATE trainees SET archived = false, archived_at = null WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'trainees', targetId: req.params.id });
  res.json(await withHours(rowToCamel(rows[0])));
});

module.exports = router;
