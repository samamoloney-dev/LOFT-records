const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

// Same access as crew.js (which this hangs off of, on the Specialist
// Training tab) - HOTC/HOFO/Flight Ops Admin/Alternate, plus Cabin
// Attendant Manager for their own crew-scoped authority.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES, 'CA_MANAGER'));

async function findItem(id) {
  const { rows } = await pool.query('SELECT * FROM specialist_training_items WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

async function assertCrewMemberEditable(crewMemberId, res) {
  const { rows } = await pool.query('SELECT archived FROM crew_members WHERE id = $1', [crewMemberId]);
  if (!rows[0]) { res.status(404).json({ error: 'Crew member not found' }); return false; }
  if (rows[0].archived) { res.status(400).json({ error: 'This crew member is archived' }); return false; }
  return true;
}

router.get('/', async (req, res) => {
  const { crewMemberId } = req.query;
  if (!crewMemberId) return res.status(400).json({ error: 'crewMemberId is required' });
  const { rows } = await pool.query(
    `SELECT * FROM specialist_training_items WHERE crew_member_id = $1 AND archived = false ORDER BY created_at DESC`,
    [crewMemberId],
  );
  res.json(rows.map(rowToCamel));
});

const createSchema = z.object({
  crewMemberId: z.string().uuid(),
  name: z.string().min(1),
  completedDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  if (!(await assertCrewMemberEditable(d.crewMemberId, res))) return;

  const { rows } = await pool.query(
    `INSERT INTO specialist_training_items (crew_member_id, name, completed_date, notes)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [d.crewMemberId, d.name, d.completedDate || null, d.notes || null],
  );
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'specialist_training_items', targetId: rows[0].id, description: `Added specialist training "${d.name}"` });
  res.status(201).json(rowToCamel(rows[0]));
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  completedDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const COLUMN_MAP = { name: 'name', completedDate: 'completed_date', notes: 'notes' };

router.patch('/:id', async (req, res) => {
  const existing = await findItem(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await assertCrewMemberEditable(existing.crewMemberId, res))) return;

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.json(existing);

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE specialist_training_items SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values,
  );
  res.json(rowToCamel(rows[0]));
});

router.post('/:id/archive', async (req, res) => {
  const existing = await findItem(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await pool.query('UPDATE specialist_training_items SET archived = true, updated_at = now() WHERE id = $1', [req.params.id]);
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'specialist_training_items', targetId: existing.id });
  res.json({ ok: true });
});

// Photos are capped at a modest size client-side (see lib/imageCompress.js)
// before they ever reach here, so appending to the jsonb array in place
// (rather than a separate table) stays cheap - a training item realistically
// only ever holds a handful of evidence photos.
const addPhotoSchema = z.object({
  name: z.string().min(1),
  data: z.string().min(1),
});

router.post('/:id/photos', async (req, res) => {
  const existing = await findItem(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await assertCrewMemberEditable(existing.crewMemberId, res))) return;

  const parsed = addPhotoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const photo = { id: crypto.randomUUID(), name: parsed.data.name, data: parsed.data.data };
  const photos = [...(existing.photos || []), photo];

  const { rows } = await pool.query(
    'UPDATE specialist_training_items SET photos = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [req.params.id, JSON.stringify(photos)],
  );
  res.status(201).json(rowToCamel(rows[0]));
});

router.delete('/:id/photos/:photoId', async (req, res) => {
  const existing = await findItem(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!(await assertCrewMemberEditable(existing.crewMemberId, res))) return;

  const photos = (existing.photos || []).filter((p) => p.id !== req.params.photoId);
  const { rows } = await pool.query(
    'UPDATE specialist_training_items SET photos = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [req.params.id, JSON.stringify(photos)],
  );
  res.json(rowToCamel(rows[0]));
});

router.delete('/:id', async (req, res) => {
  const existing = await findItem(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await pool.query('DELETE FROM specialist_training_items WHERE id = $1', [req.params.id]);
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'specialist_training_items', targetId: req.params.id, description: `Deleted specialist training "${existing.name}"` });
  res.json({ ok: true });
});

module.exports = router;
