const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, requireRole, ADMIN_ROLES, TRAINER_ROLES, PRE_SIM_ASSESSOR_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

// Ground School curriculum management - same admin-only pattern as
// syllabus items (/api/syllabus/items).
router.get('/items', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM ground_school_items ORDER BY fleet ASC, category ASC, description ASC',
  );
  res.json(rows.map(rowToCamel));
});

const createItemSchema = z.object({
  fleet: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']),
  category: z.string().min(1),
  description: z.string().min(1),
  notes: z.string().optional(),
  required: z.boolean().optional(),
});

router.post('/items', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fleet, category, description, notes, required } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO ground_school_items (fleet, category, description, notes, required)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [fleet, category, description, notes ?? null, required ?? true],
  );
  const item = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'ground_school_items', targetId: item.id });
  res.status(201).json(item);
});

router.patch('/items/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createItemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE ground_school_items SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  const item = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'ground_school_items', targetId: item.id });
  res.json(item);
});

router.delete('/items/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  await pool.query('DELETE FROM ground_school_items WHERE id = $1', [req.params.id]);
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'ground_school_items', targetId: req.params.id });
  res.status(204).end();
});

async function findTrainee(id) {
  const { rows } = await pool.query('SELECT * FROM trainees WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

router.get('/trainee/:traineeId', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const { rows: itemRows } = await pool.query(
    'SELECT * FROM ground_school_items WHERE fleet = $1 ORDER BY category ASC, description ASC',
    [trainee.fleet],
  );

  const { rows: progressRows } = await pool.query(
    'SELECT * FROM ground_school_progress WHERE trainee_id = $1',
    [trainee.id],
  );
  const progressByItem = new Map(progressRows.map((p) => [p.ground_school_item_id, rowToCamel(p)]));

  const annotated = itemRows.map((row) => {
    const item = rowToCamel(row);
    const p = progressByItem.get(item.id);
    return {
      ...item,
      completedAt: p ? p.completedAt : null,
      signedOffById: p ? p.signedOffById : null,
      signedOffByName: p ? p.signedOffByName : null,
      details: p ? p.details : {},
    };
  });

  res.json(annotated);
});

// Subject-level comments for the whole category (e.g. Pre-Simulator
// Assessment) - same pattern as syllabus_category_notes.
router.get('/trainee/:traineeId/category-notes', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await pool.query('SELECT * FROM ground_school_category_notes WHERE trainee_id = $1', [trainee.id]);
  res.json(rows.map(rowToCamel));
});

const categoryNoteSchema = z.object({
  category: z.string().min(1),
  notes: z.string().nullable().optional(),
});

router.put('/trainee/:traineeId/category-notes', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = categoryNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { category, notes } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO ground_school_category_notes (trainee_id, category, notes, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (trainee_id, category) DO UPDATE SET notes = $3, updated_at = now()
     RETURNING *`,
    [trainee.id, category, notes ?? null],
  );
  res.json(rowToCamel(rows[0]));
});

// Extra per-item fields (completed date, pass mark %, route) that some
// categories need beyond the tick/name/date sign-off - independent of
// whether the item has actually been signed off yet.
const detailsSchema = z.object({
  details: z.record(z.any()),
});

router.put('/trainee/:traineeId/items/:itemId/details', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = detailsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows } = await pool.query(
    `INSERT INTO ground_school_progress (trainee_id, ground_school_item_id, details)
     VALUES ($1, $2, $3)
     ON CONFLICT (trainee_id, ground_school_item_id) DO UPDATE SET details = $3
     RETURNING *`,
    [trainee.id, req.params.itemId, JSON.stringify(parsed.data.details)],
  );

  const progress = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'ground_school_progress', targetId: progress.groundSchoolItemId });
  res.json(progress);
});

const completeSchema = z.object({
  groundSchoolItemId: z.string().uuid(),
  signedOffByName: z.string().min(1),
});

// Pre-Simulator Assessment and instructor-led ground school courses are
// restricted beyond the general canAccessTraineeRecord check - the wider
// ground school panel otherwise has no role restriction at all today.
router.post('/trainee/:traineeId/complete', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: itemRows } = await pool.query(
    'SELECT category FROM ground_school_items WHERE id = $1',
    [parsed.data.groundSchoolItemId],
  );
  if (itemRows.length === 0) return res.status(404).json({ error: 'Ground school item not found' });
  const { category } = itemRows[0];

  if (category === 'Pre-Simulator Assessment' && !PRE_SIM_ASSESSOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Only a Training Captain, Check Captain or Examiner can sign off Pre-Simulator Assessment items' });
  }

  if (category.includes('Instructor-led')) {
    if (!TRAINER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Only trainers can sign off instructor-led ground school items' });
    }
    const { rows: progressRows } = await pool.query(
      'SELECT details FROM ground_school_progress WHERE trainee_id = $1 AND ground_school_item_id = $2',
      [trainee.id, parsed.data.groundSchoolItemId],
    );
    const passMark = progressRows[0]?.details?.passMark;
    if (passMark === undefined || passMark === null || passMark === '') {
      return res.status(400).json({ error: 'A pass mark must be recorded before this item can be signed off' });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO ground_school_progress (trainee_id, ground_school_item_id, completed_at, signed_off_by, signed_off_by_name)
     VALUES ($1, $2, now(), $3, $4)
     ON CONFLICT (trainee_id, ground_school_item_id)
     DO UPDATE SET completed_at = now(), signed_off_by = $3, signed_off_by_name = $4
     RETURNING *`,
    [trainee.id, parsed.data.groundSchoolItemId, req.user.id, parsed.data.signedOffByName],
  );

  const progress = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'ground_school_progress', targetId: progress.groundSchoolItemId });
  res.json(progress);
});

module.exports = router;
