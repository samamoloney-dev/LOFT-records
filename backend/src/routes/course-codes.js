const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { CHECK_EXPORT_NAMES } = require('../lib/exportNames');

const router = express.Router();

// Rostering-system course codes for the recurrent checks (Emergency
// Procedures, Line Check, IPC and so on) in the Currency Overview CSV
// export's "Competency Code" column. Competency codes live on the competency
// itself (competency-types.js course_code); this table holds only the checks,
// keyed by the exact export name (see lib/exportNames.js). Admin-only.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

// The single label -> code lookup the export uses: this table's codes
// overlaid with each competency's own course_code, which wins on a clash.
router.get('/map', async (req, res) => {
  const [{ rows: codeRows }, { rows: typeRows }] = await Promise.all([
    pool.query('SELECT label, code FROM course_codes WHERE archived = false'),
    pool.query('SELECT name, course_code FROM competency_types WHERE course_code IS NOT NULL AND archived = false'),
  ]);
  const map = {};
  for (const r of codeRows) map[r.label] = r.code;
  for (const r of typeRows) map[r.name] = r.course_code;
  res.json(map);
});

// Every fixed check name the export can produce with its current code (null
// if none yet), plus any older code rows that don't match one of them so
// nothing is hidden - those can be removed.
router.get('/checks', async (req, res) => {
  const { rows } = await pool.query('SELECT id, label, code FROM course_codes WHERE archived = false ORDER BY sort_order ASC, created_at ASC');
  const byLabel = new Map(rows.map((r) => [r.label, r]));
  const fixed = CHECK_EXPORT_NAMES.map((name) => ({ name, code: byLabel.get(name)?.code || null, fixed: true }));
  const other = rows.filter((r) => !CHECK_EXPORT_NAMES.includes(r.label)).map((r) => ({ id: r.id, name: r.label, code: r.code, fixed: false }));
  res.json([...fixed, ...other]);
});

const setCodeSchema = z.object({ name: z.string().min(1), code: z.string().trim().max(7) });

router.put('/checks', async (req, res) => {
  const parsed = setCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, code } = parsed.data;

  const { rows: existing } = await pool.query('SELECT id FROM course_codes WHERE label = $1', [name]);
  if (!CHECK_EXPORT_NAMES.includes(name) && existing.length === 0) {
    return res.status(400).json({ error: 'Not a recognised check name' });
  }

  if (!code) {
    await pool.query('DELETE FROM course_codes WHERE label = $1', [name]);
  } else if (existing.length > 0) {
    await pool.query('UPDATE course_codes SET code = $1 WHERE label = $2', [code, name]);
  } else {
    const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM course_codes');
    await pool.query('INSERT INTO course_codes (label, code, sort_order) VALUES ($1, $2, $3)', [name, code, maxRows[0].next]);
  }
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'course_codes', targetId: existing[0]?.id,
    description: `Set course code for "${name}" to "${code || '(none)'}"`,
  });
  res.json({ name, code: code || null });
});

// Removes an older code row that no longer matches any export name.
router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query('DELETE FROM course_codes WHERE id = $1 RETURNING label', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'DELETE', targetTable: 'course_codes', targetId: req.params.id,
    description: `Deleted course code for "${rows[0].label}"`,
  });
  res.status(204).end();
});

module.exports = router;
