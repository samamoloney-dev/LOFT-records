const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

// Admin-managed master checklist for the Certificate Generator (see
// frontend/src/pages/CertificateGenerator.jsx) - the operator's own
// Skippers paper certificate template's line items, editable here per the
// operator's explicit request to add/remove courses as required, rather
// than the fixed list this used to be (see 0110 migration).
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const { rows } = await pool.query(
    `SELECT * FROM certificate_checklist_items ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY sort_order ASC, created_at ASC`,
  );
  res.json(rows.map(rowToCamel));
});

const createSchema = z.object({ label: z.string().min(1) });

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM certificate_checklist_items');
  const { rows } = await pool.query(
    'INSERT INTO certificate_checklist_items (label, sort_order) VALUES ($1, $2) RETURNING *',
    [parsed.data.label, maxRows[0].next],
  );
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'certificate_checklist_items', targetId: rows[0].id,
    description: `Added certificate checklist item "${rows[0].label}"`,
  });
  res.status(201).json(rowToCamel(rows[0]));
});

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  archived: z.boolean().optional(),
});

router.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${key === 'label' ? 'label' : 'archived'} = $${i + 1}`);
  const values = [...entries.map(([, value]) => value), req.params.id];

  const { rows } = await pool.query(
    `UPDATE certificate_checklist_items SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'certificate_checklist_items', targetId: rows[0].id,
    description: `Updated certificate checklist item "${rows[0].label}"`,
  });
  res.json(rowToCamel(rows[0]));
});

// A hard delete - unlike a competency type, no crew data links to this
// (the certificate is a print-time snapshot, not stored anywhere), so
// there's nothing to cascade or lose by removing it outright. Archive is
// still offered as the non-destructive default in the UI.
router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query('DELETE FROM certificate_checklist_items WHERE id = $1 RETURNING label', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'DELETE', targetTable: 'certificate_checklist_items', targetId: req.params.id,
    description: `Deleted certificate checklist item "${rows[0].label}"`,
  });
  res.status(204).end();
});

module.exports = router;
