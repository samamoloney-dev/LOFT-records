const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, requireRole, ADMIN_ROLES, FLIGHT_CREATOR_ROLES } = require('../middleware/roles');
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
    'SELECT * FROM syllabus_items ORDER BY fleet ASC, section ASC, category ASC, phase ASC, description ASC',
  );
  res.json(rows.map(rowToCamel));
});

const createItemSchema = z.object({
  fleet: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']),
  roleScope: z.enum(['CAPTAIN_ONLY', 'FO_ONLY', 'BOTH']),
  phase: z.number().int().min(1),
  category: z.string().min(1),
  section: z.enum(['SYLLABUS', 'DISCUSSION']).optional(),
  description: z.string().min(1),
  notes: z.string().optional(),
  required: z.boolean().optional(),
});

router.post('/items', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { fleet, roleScope, phase, category, section, description, notes, required } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO syllabus_items (fleet, role_scope, phase, category, section, description, notes, required)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [fleet, roleScope, phase, category, section ?? 'SYLLABUS', description, notes ?? null, required ?? true],
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
     ORDER BY section ASC, category ASC, phase ASC, description ASC`,
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
      signedOffByName: p ? p.signedOffByName : null,
      outstandingForPhase: item.required && item.phase === trainee.phase && !p?.completedAt,
    };
  });

  res.json(annotated);
});

const completeSchema = z.object({
  syllabusItemId: z.string().uuid(),
  signedOffByName: z.string().min(1),
});

router.post('/trainee/:traineeId/complete', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows } = await pool.query(
    `INSERT INTO syllabus_progress (trainee_id, syllabus_item_id, completed_at, signed_off_by, signed_off_by_name)
     VALUES ($1, $2, now(), $3, $4)
     ON CONFLICT (trainee_id, syllabus_item_id)
     DO UPDATE SET completed_at = now(), signed_off_by = $3, signed_off_by_name = $4
     RETURNING *`,
    [trainee.id, parsed.data.syllabusItemId, req.user.id, parsed.data.signedOffByName],
  );

  const progress = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'syllabus_progress', targetId: progress.syllabusItemId });
  res.json(progress);
});

// Phase completion - a distinct signable event (Training Captain + Applicant
// both sign), not just "every item in the phase is ticked". Signing off
// advances the trainee to the next phase.
router.get('/trainee/:traineeId/phase-completions', async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await pool.query(
    'SELECT * FROM phase_completions WHERE trainee_id = $1 ORDER BY phase ASC',
    [trainee.id],
  );
  res.json(rows.map(rowToCamel));
});

const signatureSchema = z.object({
  trainingCaptainSignature: z.string().nullable().optional(),
  applicantSignature: z.string().nullable().optional(),
});

router.put('/trainee/:traineeId/phase-completions/:phase', requireRole(...FLIGHT_CREATOR_ROLES, 'TRAINEE'), async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const phase = Number(req.params.phase);
  const parsed = signatureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // A trainee may only sign their own record, and only their own applicant
  // signature - never the Training Captain's.
  if (req.user.role === 'TRAINEE') {
    if (req.user.trainee?.id !== trainee.id) return res.status(403).json({ error: 'Forbidden' });
    if (parsed.data.trainingCaptainSignature !== undefined) return res.status(403).json({ error: 'Forbidden' });
  }

  const d = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO phase_completions (trainee_id, phase, training_captain_signature, applicant_signature)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (trainee_id, phase) DO UPDATE SET
       training_captain_signature = COALESCE($3, phase_completions.training_captain_signature),
       applicant_signature = COALESCE($4, phase_completions.applicant_signature)
     RETURNING *`,
    [trainee.id, phase, d.trainingCaptainSignature ?? null, d.applicantSignature ?? null],
  );

  const completion = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'phase_completions', targetId: completion.id });
  res.json(completion);
});

router.post('/trainee/:traineeId/phase-completions/:phase/complete', requireRole(...FLIGHT_CREATOR_ROLES), async (req, res) => {
  const trainee = await findTrainee(req.params.traineeId);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const phase = Number(req.params.phase);
  const { rows } = await pool.query(
    'SELECT * FROM phase_completions WHERE trainee_id = $1 AND phase = $2',
    [trainee.id, phase],
  );
  const completion = rows[0] ? rowToCamel(rows[0]) : null;
  if (!completion?.trainingCaptainSignature || !completion?.applicantSignature) {
    return res.status(400).json({ error: 'Both signatures are required before completing this phase' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: updatedRows } = await client.query(
      'UPDATE phase_completions SET completed_at = now() WHERE id = $1 RETURNING *',
      [completion.id],
    );
    if (trainee.phase <= phase) {
      await client.query('UPDATE trainees SET phase = $1 WHERE id = $2', [phase + 1, trainee.id]);
    }
    await client.query('COMMIT');
    await logAction({ userId: req.user.id, action: 'COMPLETE', targetTable: 'phase_completions', targetId: completion.id });
    res.json(rowToCamel(updatedRows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
