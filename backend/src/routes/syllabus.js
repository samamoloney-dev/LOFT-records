const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

function roleScopeFor(traineeRole) {
  return traineeRole === 'CAPTAIN' ? 'CAPTAIN_ONLY' : traineeRole === 'FIRST_OFFICER' ? 'FO_ONLY' : 'BOTH';
}

// Syllabus curriculum management - who gets to define what's on the syllabus
// in the first place, as opposed to /trainee/:id which is for viewing and
// ticking off progress against it.
router.get('/items', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM syllabus_items ORDER BY fleet ASC, phase ASC, description ASC',
  );
  res.json(rows.map(rowToCamel));
});

const createItemSchema = z.object({
  fleet: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']),
  roleScope: z.enum(['CAPTAIN_ONLY', 'FO_ONLY', 'BOTH']),
  phase: z.number().int().min(1),
  description: z.string().min(1),
  required: z.boolean().optional(),
});

router.post('/items', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fleet, roleScope, phase, description, required } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO syllabus_items (fleet, role_scope, phase, description, required)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [fleet, roleScope, phase, description, required ?? true],
  );
  const item = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'syllabus_items', targetId: item.id });
  res.status(201).json(item);
});

router.delete('/items/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  await pool.query('DELETE FROM syllabus_items WHERE id = $1', [req.params.id]);
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'syllabus_items', targetId: req.params.id });
  res.status(204).end();
});

async function findTrainee(id) {
  const { rows } = await pool.query('SELECT * FROM trainees WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

// Syllabus items for a fleet, annotated with the trainee's progress and
// whether each required item is still outstanding for their current phase.
router.get('/trainee/:traineeId', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const scope = roleScopeFor(trainee.role);
  const { rows: itemRows } = await pool.query(
    `SELECT * FROM syllabus_items
     WHERE fleet = $1 AND (role_scope = 'BOTH' OR role_scope = $2)
     ORDER BY phase ASC, description ASC`,
    [trainee.fleet, scope],
  );

  const { rows: progressRows } = await pool.query(
    'SELECT * FROM syllabus_progress WHERE trainee_id = $1',
    [trainee.id],
  );
  const progressByItem = new Map(progressRows.map((p) => [p.syllabus_item_id, rowToCamel(p)]));

  const annotated = itemRows.map((row) => {
    const item = rowToCamel(row);
    const p = progressByItem.get(item.id);
    return {
      ...item,
      completedAt: p ? p.completedAt : null,
      signedOffById: p ? p.signedOffById : null,
      outstandingForPhase: item.required && item.phase === trainee.phase && !p?.completedAt,
    };
  });

  res.json(annotated);
});

const completeSchema = z.object({ syllabusItemId: z.string().uuid() });

router.post('/trainee/:traineeId/complete', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows } = await pool.query(
    `INSERT INTO syllabus_progress (trainee_id, syllabus_item_id, completed_at, signed_off_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (trainee_id, syllabus_item_id)
     DO UPDATE SET completed_at = now(), signed_off_by = $3
     RETURNING *`,
    [trainee.id, parsed.data.syllabusItemId, req.user.id],
  );

  const progress = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'syllabus_progress', targetId: progress.syllabusItemId });
  res.json(progress);
});

module.exports = router;
