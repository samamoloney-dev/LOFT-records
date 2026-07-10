const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, isAdmin, LANDING_ASSESSMENT_EDIT_ROLES } = require('../middleware/roles');
const { resolveAssignee } = require('../lib/assignee');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

async function assertTraineeVisible(req, res, traineeId) {
  const { rows } = await pool.query('SELECT * FROM trainees WHERE id = $1', [traineeId]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  const trainee = rowToCamel(rows[0]);
  if (!canAccessTraineeRecord(req.user, trainee)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return trainee;
}

router.get('/:traineeId', async (req, res) => {
  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const { rows } = await pool.query('SELECT * FROM landing_assessment_forms WHERE trainee_id = $1', [trainee.id]);
  res.json({ form: rows[0] ? rowToCamel(rows[0]) : null });
});

const upsertSchema = z.object({
  observationSectors: z.array(z.record(z.any())).optional(),
  demonstrationSectors: z.array(z.record(z.any())).optional(),
  comments: z.string().nullable().optional(),
  releaseSignature: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  exempt: z.boolean().optional(),
  hotcHofoSignature: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

const CONTENT_FIELDS = ['observationSectors', 'demonstrationSectors', 'comments', 'releaseSignature', 'releaseDate', 'exempt', 'hotcHofoSignature'];

router.put('/:traineeId', async (req, res) => {
  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  // Distinguish "assignedTo not sent, leave as-is" from "assignedTo: null,
  // unassign" - zod would otherwise turn both into undefined.
  const hasAssignedTo = Object.prototype.hasOwnProperty.call(req.body, 'assignedTo');
  if (hasAssignedTo && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can assign this assessment' });
  }
  const hasContentChange = CONTENT_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(req.body, f));
  if (hasContentChange && !LANDING_ASSESSMENT_EDIT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Only a Check Captain or Examiner can complete this assessment' });
  }

  const assignee = hasAssignedTo
    ? await resolveAssignee(d.assignedTo)
    : { assignedToName: null, assignedToArn: null, assignedToRole: null };

  const { rows } = await pool.query(
    `INSERT INTO landing_assessment_forms
       (trainee_id, observation_sectors, demonstration_sectors, comments, release_signature, release_date, exempt, hotc_hofo_signature,
        assigned_to, assigned_to_name, assigned_to_arn, assigned_to_role)
     VALUES ($1, COALESCE($2, '[]'::jsonb), COALESCE($3, '[]'::jsonb), $4, $5, $6, COALESCE($7, false), $8, $9, $10, $11, $12)
     ON CONFLICT (trainee_id) DO UPDATE SET
       observation_sectors = COALESCE($2, landing_assessment_forms.observation_sectors),
       demonstration_sectors = COALESCE($3, landing_assessment_forms.demonstration_sectors),
       comments = COALESCE($4, landing_assessment_forms.comments),
       release_signature = COALESCE($5, landing_assessment_forms.release_signature),
       release_date = COALESCE($6, landing_assessment_forms.release_date),
       exempt = COALESCE($7, landing_assessment_forms.exempt),
       hotc_hofo_signature = COALESCE($8, landing_assessment_forms.hotc_hofo_signature),
       assigned_to = CASE WHEN $13 THEN $9::uuid ELSE landing_assessment_forms.assigned_to END,
       assigned_to_name = CASE WHEN $13 THEN $10 ELSE landing_assessment_forms.assigned_to_name END,
       assigned_to_arn = CASE WHEN $13 THEN $11 ELSE landing_assessment_forms.assigned_to_arn END,
       assigned_to_role = CASE WHEN $13 THEN $12 ELSE landing_assessment_forms.assigned_to_role END
     RETURNING *`,
    [
      trainee.id,
      d.observationSectors ? JSON.stringify(d.observationSectors) : null,
      d.demonstrationSectors ? JSON.stringify(d.demonstrationSectors) : null,
      d.comments ?? null,
      d.releaseSignature ?? null,
      d.releaseDate ?? null,
      d.exempt ?? null,
      d.hotcHofoSignature ?? null,
      d.assignedTo ?? null,
      assignee.assignedToName,
      assignee.assignedToArn,
      assignee.assignedToRole,
      hasAssignedTo,
    ],
  );

  const form = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'landing_assessment_forms', targetId: form.id });
  res.json(form);
});

router.post('/:traineeId/complete', async (req, res) => {
  if (!LANDING_ASSESSMENT_EDIT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Only a Check Captain or Examiner can complete this assessment' });
  }
  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const { rows } = await pool.query('SELECT * FROM landing_assessment_forms WHERE trainee_id = $1', [trainee.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'No Landing Assessment form to complete' });
  const form = rowToCamel(rows[0]);

  const releasedOk = !!form.releaseSignature && !!form.releaseDate;
  const exemptOk = form.exempt && !!form.hotcHofoSignature;
  if (!releasedOk && !exemptOk) {
    return res.status(400).json({ error: 'Either the release signature and date, or Exempt with an HOTC/HOFO signature, must be recorded before completing' });
  }

  const { rows: updatedRows } = await pool.query(
    'UPDATE landing_assessment_forms SET completed_at = now() WHERE id = $1 RETURNING *',
    [form.id],
  );
  await logAction({
    userId: req.user.id, action: 'COMPLETE', targetTable: 'landing_assessment_forms', targetId: trainee.id,
    description: `Completed Landing Assessment for ${trainee.firstName} ${trainee.lastName}`,
  });
  res.json(rowToCamel(updatedRows[0]));
});

router.post('/:traineeId/archive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can archive checks' });

  const { rows: existingRows } = await pool.query('SELECT * FROM landing_assessment_forms WHERE trainee_id = $1', [req.params.traineeId]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'No Landing Assessment form found for this trainee' });
  const existing = rowToCamel(existingRows[0]);
  if (!existing.completedAt) return res.status(400).json({ error: 'The assessment must be completed before it can be archived' });

  const { rows } = await pool.query(
    'UPDATE landing_assessment_forms SET archived = true, archived_at = now() WHERE trainee_id = $1 RETURNING *',
    [req.params.traineeId],
  );
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'landing_assessment_forms', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

router.post('/:traineeId/unarchive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can unarchive checks' });

  const { rows } = await pool.query(
    'UPDATE landing_assessment_forms SET archived = false, archived_at = null WHERE trainee_id = $1 RETURNING *',
    [req.params.traineeId],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No Landing Assessment form found for this trainee' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'landing_assessment_forms', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

module.exports = router;
