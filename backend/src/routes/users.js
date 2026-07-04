const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES, CHECK_ACCESS_TYPES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

const checkAccessSchema = z.array(z.enum(CHECK_ACCESS_TYPES)).optional();
const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const fleetsSchema = z.array(z.enum(FLEET_VALUES)).optional();

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum([
    'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER',
    'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'TRAINEE',
  ]),
  fleets: fleetsSchema,
  arn: z.string().optional(),
  checkAccess: checkAccessSchema,
});

function serialize(row) {
  const u = rowToCamel(row);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    fleets: parsePgArray(u.fleets),
    arn: u.arn,
    checkAccess: parsePgArray(u.checkAccess),
    createdAt: u.createdAt,
  };
}

router.use(requireAuth);

// Open to any authenticated staff member (not admin-only) - lets check forms
// offer a "pick the assessor from approved staff" dropdown without exposing
// email to everyone.
router.get('/roster', async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, role, arn, check_access, fleets FROM users ORDER BY name ASC');
  res.json(rows.map(rowToCamel).map((u) => ({ ...u, checkAccess: parsePgArray(u.checkAccess), fleets: parsePgArray(u.fleets) })));
});

router.get('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY name ASC');
  res.json(rows.map(serialize));
});

router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, email, password, role, fleets, arn, checkAccess } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, fleets, arn, check_access)
     VALUES ($1, $2, $3, $4, $5::fleet[], $6, $7::check_access_type[]) RETURNING *`,
    [name, email, passwordHash, role, fleets || [], arn || null, checkAccess || []],
  );
  const user = rows[0];
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'users', targetId: user.id });
  res.status(201).json(serialize(user));
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum([
    'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER',
    'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'TRAINEE',
  ]).optional(),
  fleets: fleetsSchema,
  arn: z.string().optional(),
  checkAccess: checkAccessSchema,
});

const COLUMN_MAP = { name: 'name', role: 'role', fleets: 'fleets', arn: 'arn', checkAccess: 'check_access' };
const CAST_MAP = { checkAccess: '::check_access_type[]', fleets: '::fleet[]' };

router.patch('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}${CAST_MAP[key] || ''}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'users', targetId: req.params.id });
  res.json(serialize(rows[0]));
});

router.delete('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    // Foreign key violation - the only relationship left that still blocks
    // deletion is a trainee account linked to this staff member (their name
    // on flights/checks/sign-offs is snapshotted separately and survives).
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete this staff member - there is a trainee account linked to them. Remove that link first.' });
    }
    throw err;
  }
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'users', targetId: req.params.id });
  res.status(204).end();
});

module.exports = router;
