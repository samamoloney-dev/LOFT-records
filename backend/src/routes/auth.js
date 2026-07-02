const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const { logAction } = require('../lib/audit');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    fleetAccess: user.fleetAccess,
    traineeId: user.trainee ? user.trainee.id : null,
  };
}

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials' });

  const { email, password } = parsed.data;
  const { rows } = await pool.query(
    `SELECT u.*, t.id AS trainee_id
     FROM users u
     LEFT JOIN trainees t ON t.user_id = u.id
     WHERE u.email = $1`,
    [email],
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

  const row = rowToCamel(rows[0]);
  const valid = await bcrypt.compare(password, row.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    fleetAccess: row.fleetAccess,
    trainee: row.traineeId ? { id: row.traineeId } : null,
  };

  setSessionCookie(res, user);
  await logAction({ userId: user.id, action: 'LOGIN', targetTable: 'users', targetId: user.id });
  res.json({ user: serializeUser(user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  clearSessionCookie(res);
  await logAction({ userId: req.user.id, action: 'LOGOUT', targetTable: 'users', targetId: req.user.id });
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

module.exports = router;
