const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, requireRole, ADMIN_ROLES, TRAINER_ROLES, PRE_SIM_ASSESSOR_ROLES, isCaOnlyRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { requestOrApply, applyToTable } = require('../lib/approvals');

const router = express.Router();

router.use(requireAuth);

const CA_FLEETS = ['CA_DASH_8', 'CA_FOKKER_100'];
function forbiddenFleetForCaManager(req, fleet) {
  return isCaOnlyRole(req.user) && fleet && !CA_FLEETS.includes(fleet);
}

// Ground School curriculum management - same admin-only pattern as syllabus
// items (/api/syllabus/items), plus Cabin Attendant Manager scoped to cabin
// attendant fleet items, whose edits queue for HOTC approval instead of
// applying immediately - see lib/approvals.js. syllabusId scopes the list
// to one named syllabus's own Ground School bucket (see syllabi.js) -
// omitted/empty means the fleet's standard bucket (syllabus_id IS NULL).
router.get('/items', requireRole(...ADMIN_ROLES, 'CA_MANAGER'), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM ground_school_items WHERE syllabus_id IS NOT DISTINCT FROM $1 ORDER BY fleet ASC, category ASC, description ASC',
    [req.query.syllabusId || null],
  );
  const items = rows.map(rowToCamel);
  res.json(isCaOnlyRole(req.user) ? items.filter((i) => CA_FLEETS.includes(i.fleet)) : items);
});

const createItemSchema = z.object({
  fleet: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']),
  category: z.string().min(1),
  description: z.string().min(1),
  notes: z.string().optional(),
  required: z.boolean().optional(),
  syllabusId: z.string().uuid().nullable().optional(),
});

router.post('/items', requireRole(...ADMIN_ROLES, 'CA_MANAGER'), async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (forbiddenFleetForCaManager(req, parsed.data.fleet)) {
    return res.status(403).json({ error: 'Cabin Attendant Manager can only add cabin attendant ground school items' });
  }

  const data = { ...parsed.data, required: parsed.data.required ?? true };
  const { applied, result, pending } = await requestOrApply({
    req, tableName: 'ground_school_items', action: 'CREATE', proposedData: data,
    summary: `Add ground school item "${data.description}"`,
    applyFn: async () => {
      const item = await applyToTable('ground_school_items', 'CREATE', null, data);
      await logAction({
        userId: req.user.id, action: 'CREATE', targetTable: 'ground_school_items', targetId: item.id,
        description: `Added ground school item "${item.description}"`,
      });
      return item;
    },
  });
  if (applied) return res.status(201).json(result);
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'content_change_requests', targetId: pending.id,
    description: `Submitted ground school item "${data.description}" for HOTC approval`,
  });
  res.status(202).json({ pending: true, changeRequest: pending });
});

router.patch('/items/:id', requireRole(...ADMIN_ROLES, 'CA_MANAGER'), async (req, res) => {
  const parsed = createItemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const { rows: existingRows } = await pool.query('SELECT * FROM ground_school_items WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (forbiddenFleetForCaManager(req, existing.fleet) || forbiddenFleetForCaManager(req, parsed.data.fleet)) {
    return res.status(403).json({ error: 'Cabin Attendant Manager can only edit cabin attendant ground school items' });
  }

  const { applied, result, pending } = await requestOrApply({
    req, tableName: 'ground_school_items', action: 'UPDATE', itemId: existing.id,
    proposedData: parsed.data, previousData: existing,
    summary: `Update ground school item "${existing.description}"`,
    applyFn: async () => {
      const item = await applyToTable('ground_school_items', 'UPDATE', existing.id, parsed.data);
      await logAction({
        userId: req.user.id, action: 'UPDATE', targetTable: 'ground_school_items', targetId: item.id,
        description: `Updated ground school item "${item.description}"`,
      });
      return item;
    },
  });
  if (applied) return res.json(result);
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'content_change_requests', targetId: pending.id,
    description: `Submitted a change to ground school item "${existing.description}" for HOTC approval`,
  });
  res.status(202).json({ pending: true, changeRequest: pending });
});

router.delete('/items/:id', requireRole(...ADMIN_ROLES, 'CA_MANAGER'), async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM ground_school_items WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (forbiddenFleetForCaManager(req, existing.fleet)) {
    return res.status(403).json({ error: 'Cabin Attendant Manager can only delete cabin attendant ground school items' });
  }

  const { applied, pending } = await requestOrApply({
    req, tableName: 'ground_school_items', action: 'DELETE', itemId: existing.id, previousData: existing,
    summary: `Delete ground school item "${existing.description}"`,
    applyFn: async () => {
      await applyToTable('ground_school_items', 'DELETE', existing.id);
      await logAction({
        userId: req.user.id, action: 'DELETE', targetTable: 'ground_school_items', targetId: existing.id,
        description: `Deleted ground school item "${existing.description}"`,
      });
    },
  });
  if (applied) return res.status(204).end();
  await logAction({
    userId: req.user.id, action: 'DELETE', targetTable: 'content_change_requests', targetId: pending.id,
    description: `Submitted deletion of ground school item "${existing.description}" for HOTC approval`,
  });
  res.status(202).json({ pending: true, changeRequest: pending });
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
    'SELECT * FROM ground_school_items WHERE fleet = $1 AND syllabus_id IS NOT DISTINCT FROM $2 ORDER BY category ASC, description ASC',
    [trainee.fleet, trainee.syllabusId],
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
    'SELECT category, description FROM ground_school_items WHERE id = $1',
    [parsed.data.groundSchoolItemId],
  );
  if (itemRows.length === 0) return res.status(404).json({ error: 'Ground school item not found' });
  const { category, description: itemDescription } = itemRows[0];

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
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'ground_school_progress', targetId: trainee.id,
    description: `Signed off "${itemDescription}" for ${trainee.firstName} ${trainee.lastName}`,
  });
  res.json(progress);
});

module.exports = router;
