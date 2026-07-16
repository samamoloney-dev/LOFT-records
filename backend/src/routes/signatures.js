const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

// Only HOTC, HOFO and Flight Ops Admin can reset someone's PIN - the
// "reset PIN" admin action noted as a future follow-up when PIN
// signatures were first built (POST /set below 409s once a PIN already
// exists, with no way back in otherwise if someone forgets theirs).
const PIN_RESET_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

const router = express.Router();
router.use(requireAuth);

// Resolves a personType to its table, id column, and a name expression -
// the three "person" records that can own a signature: the assigned staff
// examiner/assessor (users), and a candidate linked to a crew or trainee
// record. An ad-hoc/free-text candidate has no row here at all, so callers
// simply don't have a personId to send - handled entirely on the frontend
// (PinSignature.jsx renders nothing and the form falls back to a plain
// typed input in that case).
const PERSON_TABLES = {
  user: { table: 'users', nameExpr: 'name' },
  crewMember: { table: 'crew_members', nameExpr: "first_name || ' ' || last_name" },
  trainee: { table: 'trainees', nameExpr: "first_name || ' ' || last_name" },
};

const personSchema = z.object({
  personType: z.enum(['user', 'crewMember', 'trainee']),
  personId: z.string().uuid(),
});

async function findPerson(personType, personId) {
  const { table, nameExpr } = PERSON_TABLES[personType];
  const { rows } = await pool.query(`SELECT id, pin_hash, ${nameExpr} AS name FROM ${table} WHERE id = $1`, [personId]);
  return rows[0] || null;
}

router.post('/status', async (req, res) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const person = await findPerson(parsed.data.personType, parsed.data.personId);
  if (!person) return res.status(404).json({ error: 'Not found' });
  res.json({ hasPin: !!person.pin_hash });
});

const setSchema = personSchema.extend({
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  confirmPin: z.string(),
});

router.post('/set', async (req, res) => {
  const parsed = setSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { personType, personId, pin, confirmPin } = parsed.data;
  if (pin !== confirmPin) return res.status(400).json({ error: 'PINs do not match' });

  const person = await findPerson(personType, personId);
  if (!person) return res.status(404).json({ error: 'Not found' });
  if (person.pin_hash) return res.status(409).json({ error: 'A PIN is already set for this person' });

  const { table } = PERSON_TABLES[personType];
  const pinHash = await bcrypt.hash(pin, 10);
  await pool.query(`UPDATE ${table} SET pin_hash = $1 WHERE id = $2`, [pinHash, personId]);
  await logAction({ userId: req.user.id, action: 'SET_PIN', targetTable: table, targetId: personId });
  res.json({ verified: true, name: person.name });
});

// Clears the stored PIN entirely (does not set a new one) - the person
// just goes through the normal "set your PIN" flow again next time they
// try to sign something, same as if they'd never set one.
router.post('/reset', requireRole(...PIN_RESET_ROLES), async (req, res) => {
  const parsed = personSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { personType, personId } = parsed.data;

  const person = await findPerson(personType, personId);
  if (!person) return res.status(404).json({ error: 'Not found' });

  const { table } = PERSON_TABLES[personType];
  await pool.query(`UPDATE ${table} SET pin_hash = NULL WHERE id = $1`, [personId]);
  ATTEMPTS.delete(attemptKey(personType, personId));
  await logAction({ userId: req.user.id, action: 'RESET_PIN', targetTable: table, targetId: personId });
  res.json({ reset: true, name: person.name });
});

// No persistent rate-limit storage exists elsewhere in this app - an
// in-memory map is a reasonable fit for a single small deployment. Keyed
// per person so one person's lockout doesn't affect anyone else, reset on
// every successful verification.
const ATTEMPTS = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function attemptKey(personType, personId) {
  return `${personType}:${personId}`;
}

const verifySchema = personSchema.extend({
  pin: z.string(),
});

router.post('/verify', async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { personType, personId, pin } = parsed.data;

  const key = attemptKey(personType, personId);
  const state = ATTEMPTS.get(key);
  if (state && state.lockedUntil && state.lockedUntil > Date.now()) {
    const minutes = Math.ceil((state.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({ error: `Too many incorrect attempts - try again in ${minutes} minute${minutes === 1 ? '' : 's'}` });
  }

  const person = await findPerson(personType, personId);
  if (!person) return res.status(404).json({ error: 'Not found' });
  if (!person.pin_hash) return res.status(400).json({ error: 'No PIN set for this person yet' });

  const valid = await bcrypt.compare(pin, person.pin_hash);
  if (!valid) {
    const attempts = (state?.attempts || 0) + 1;
    ATTEMPTS.set(key, {
      attempts,
      lockedUntil: attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null,
    });
    return res.status(403).json({ error: 'Incorrect PIN' });
  }

  ATTEMPTS.delete(key);
  await logAction({ userId: req.user.id, action: 'VERIFY_PIN', targetTable: PERSON_TABLES[personType].table, targetId: personId });
  res.json({ verified: true, name: person.name });
});

module.exports = router;
