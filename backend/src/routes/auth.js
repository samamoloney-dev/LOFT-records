const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth, issueToken } = require('../middleware/auth');
const { logAction } = require('../lib/audit');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Same in-memory lockout pattern as signatures.js's PIN verification (no
// persistent rate-limit storage exists elsewhere in this app, and an
// in-memory map is a reasonable fit for a single small deployment) - login
// protects real account credentials, not just a signature, and had no
// brute-force protection at all before this, unlike the PIN flow it sits
// right next to. Keyed per email (case-insensitive) so one account's
// lockout doesn't affect anyone else, reset on every successful login.
const LOGIN_ATTEMPTS = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    fleets: user.fleets,
    checkAccess: user.checkAccess,
    traineeId: user.trainee ? user.trainee.id : null,
  };
}

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials' });

  const { email, password } = parsed.data;
  const key = email.toLowerCase();
  const state = LOGIN_ATTEMPTS.get(key);
  if (state && state.lockedUntil && state.lockedUntil > Date.now()) {
    const minutes = Math.ceil((state.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many incorrect attempts - try again in ${minutes} minute${minutes === 1 ? '' : 's'}` });
  }

  const { rows } = await pool.query(
    `SELECT u.*, t.id AS trainee_id
     FROM users u
     LEFT JOIN trainees t ON t.user_id = u.id
     WHERE u.email = $1`,
    [email],
  );
  // Same generic error and the same failed-attempt bookkeeping whether the
  // email doesn't exist or the password is wrong - an unknown email must
  // count against the lockout too, or that path stays an unlimited-attempt
  // oracle for confirming which emails exist even with a shared error
  // message.
  const row = rows[0] ? rowToCamel(rows[0]) : null;
  const valid = row && await bcrypt.compare(password, row.passwordHash);
  if (!valid) {
    const attempts = (state?.attempts || 0) + 1;
    LOGIN_ATTEMPTS.set(key, {
      attempts,
      lockedUntil: attempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOGIN_LOCKOUT_MS : null,
    });
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  LOGIN_ATTEMPTS.delete(key);

  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    fleets: parsePgArray(row.fleets),
    checkAccess: parsePgArray(row.checkAccess),
    trainee: row.traineeId ? { id: row.traineeId } : null,
  };

  await logAction({ userId: user.id, action: 'LOGIN', targetTable: 'users', targetId: user.id });
  res.json({ user: serializeUser(user), token: issueToken(user) });
});

// The token itself is stateless (see issueToken) - there's nothing server-side
// to invalidate, this just logs the event. The frontend forgetting its own
// token is what actually "logs out" the browser.
router.post('/logout', requireAuth, async (req, res) => {
  await logAction({ userId: req.user.id, action: 'LOGOUT', targetTable: 'users', targetId: req.user.id });
  res.status(204).end();
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// Self-service - every staff member can change their own login password
// (distinct from the signature PIN, see signatures.js) regardless of role,
// since only HOTC/HOFO/Flight Ops Admin can even see the Staff tab where an
// account is first created. Requires the current password, unlike the PIN
// reset flow, since there's no "forgot it entirely" recovery path here.
router.post('/change-password', requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  const valid = await bcrypt.compare(parsed.data.currentPassword, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'users', targetId: req.user.id, description: 'Changed own password' });
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

module.exports = router;
