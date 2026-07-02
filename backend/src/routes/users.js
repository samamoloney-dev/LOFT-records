const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum([
    'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER',
    'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'TRAINEE',
  ]),
  fleetAccess: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'ALL']).optional(),
});

function serialize(row) {
  const u = rowToCamel(row);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    fleetAccess: u.fleetAccess,
    createdAt: u.createdAt,
  };
}

router.use(requireAuth);

router.get('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY name ASC');
  res.json(rows.map(serialize));
});

router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, email, password, role, fleetAccess } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, fleet_access)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, email, passwordHash, role, fleetAccess || 'ALL'],
  );
  const user = rows[0];
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'users', targetId: user.id });
  res.status(201).json(serialize(user));
});

router.delete('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'users', targetId: req.params.id });
  res.status(204).end();
});

module.exports = router;
