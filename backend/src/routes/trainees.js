const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, canAccessArchived, isCaOnlyRole } = require('../middleware/roles');
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

router.post('/', async (req, res) => {
  if (isCaOnlyRole(req.user) && req.body.type !== 'CABIN_ATTENDANT') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { firstName, lastName, type, role, fleet, phase } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO trainees (first_name, last_name, type, role, fleet, phase)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [firstName, lastName, type, role, fleet, phase || 1],
  );
  const trainee = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'trainees', targetId: trainee.id });
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

module.exports = router;
