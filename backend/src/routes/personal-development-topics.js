const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

// The Personal Development topics that rotate through the years - the list a
// staff member's Personal Development file is filed under.
router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const { rows } = await pool.query(
    `SELECT * FROM personal_development_topics ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY sort_order ASC, created_at ASC`,
  );
  res.json(rows.map(rowToCamel));
});

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });

router.post('/', async (req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A topic name is required' });
  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM personal_development_topics');
  try {
    const { rows } = await pool.query(
      'INSERT INTO personal_development_topics (name, sort_order) VALUES ($1, $2) RETURNING *',
      [parsed.data.name, maxRows[0].next],
    );
    await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'personal_development_topics', targetId: rows[0].id, description: `Added Personal Development topic "${parsed.data.name}"` });
    res.status(201).json(rowToCamel(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That topic already exists' });
    throw err;
  }
});

const updateSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), archived: z.boolean().optional() });

// Renaming a topic also renames it on the files already filed under it, so a
// staff member's history keeps reading correctly.
router.patch('/:id', async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, archived } = parsed.data;
  const { rows: existing } = await pool.query('SELECT * FROM personal_development_topics WHERE id = $1', [req.params.id]);
  if (existing.length === 0) return res.status(404).json({ error: 'Not found' });
  try {
    const { rows } = await pool.query(
      'UPDATE personal_development_topics SET name = COALESCE($2, name), archived = COALESCE($3, archived) WHERE id = $1 RETURNING *',
      [req.params.id, name ?? null, archived ?? null],
    );
    if (name && name !== existing[0].name) {
      await pool.query(`UPDATE staff_documents SET topic = $2 WHERE kind = 'PERSONAL_DEVELOPMENT' AND topic = $1`, [existing[0].name, name]);
    }
    await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'personal_development_topics', targetId: rows[0].id });
    res.json(rowToCamel(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That topic already exists' });
    throw err;
  }
});

module.exports = router;
