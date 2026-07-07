const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

// Admin-managed catalog of competency types (Dangerous Goods, First Aid,
// etc.) - see 0037_competency_types.sql. Every active type applies to
// every crew member automatically (see crew.js GET /:id/competencies),
// so managing this list is the only "add a competency" step there is -
// no per-crew-member dropdown any more, just a shared, extensible list.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const { rows } = await pool.query(
    `SELECT * FROM competency_types ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY sort_order ASC, created_at ASC`,
  );
  res.json(rows.map(rowToCamel));
});

const createSchema = z.object({
  name: z.string().min(1),
  // Most competencies apply to every crew member (null) - scoping to one
  // type is the exception (e.g. Medical, pilot-only).
  appliesTo: z.enum(['PILOT', 'CABIN_ATTENDANT']).nullable().optional(),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM competency_types');
  try {
    const { rows } = await pool.query(
      'INSERT INTO competency_types (name, sort_order, applies_to) VALUES ($1, $2, $3) RETURNING *',
      [parsed.data.name, maxRows[0].next, parsed.data.appliesTo || null],
    );
    await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'competency_types', targetId: rows[0].id });
    res.status(201).json(rowToCamel(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A competency with that name already exists' });
    throw err;
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  archived: z.boolean().optional(),
  appliesTo: z.enum(['PILOT', 'CABIN_ATTENDANT']).nullable().optional(),
});
const COLUMN_MAP = { name: 'name', archived: 'archived', appliesTo: 'applies_to' };

router.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE competency_types SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'competency_types', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

module.exports = router;
