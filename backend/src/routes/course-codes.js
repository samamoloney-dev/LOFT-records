const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

// Admin-managed label -> course code mapping for the Currency Overview CSV
// export's "Competency Code" column (see frontend/src/pages/CurrencyOverview.jsx
// codeFor) - the join key the rostering system matches on, previously
// hardcoded in source. Admin-only end to end, matching every other
// Syllabus-tab admin list.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const { rows } = await pool.query(
    `SELECT * FROM course_codes ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY sort_order ASC, created_at ASC`,
  );
  res.json(rows.map(rowToCamel));
});

const createSchema = z.object({ label: z.string().min(1), code: z.string().min(1).max(7) });

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM course_codes');
  const { rows } = await pool.query(
    'INSERT INTO course_codes (label, code, sort_order) VALUES ($1, $2, $3) RETURNING *',
    [parsed.data.label, parsed.data.code, maxRows[0].next],
  );
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'course_codes', targetId: rows[0].id,
    description: `Added course code "${rows[0].code}" for "${rows[0].label}"`,
  });
  res.status(201).json(rowToCamel(rows[0]));
});

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  code: z.string().min(1).max(7).optional(),
  archived: z.boolean().optional(),
});
const COLUMN_MAP = { label: 'label', code: 'code', archived: 'archived' };

router.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}`);
  const values = [...entries.map(([, value]) => value), req.params.id];

  const { rows } = await pool.query(
    `UPDATE course_codes SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'course_codes', targetId: rows[0].id,
    description: `Updated course code "${rows[0].code}" for "${rows[0].label}"`,
  });
  res.json(rowToCamel(rows[0]));
});

// A hard delete - the CSV export just falls back to its own auto-generated
// code for a label with no row here, so there's nothing to cascade or lose.
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
