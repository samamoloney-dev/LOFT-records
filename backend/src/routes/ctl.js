const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, isAdmin } = require('../middleware/roles');
const { resolveAssignee } = require('../lib/assignee');
const { logAction } = require('../lib/audit');
const { NTS_MARKERS } = require('../../db/phase4-items');

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

// Archive view - browses archived Check to Line forms across all trainees,
// unlike the per-trainee route below.
router.get('/', async (req, res) => {
  if (req.query.archived !== 'true' || !isAdmin(req.user)) {
    return res.status(400).json({ error: 'traineeId is required' });
  }

  const { rows } = await pool.query(
    `SELECT ctl.*, t.first_name, t.last_name, t.type AS trainee_type, t.fleet AS trainee_fleet
     FROM check_to_line_forms ctl
     JOIN trainees t ON t.id = ctl.trainee_id
     WHERE ctl.archived = true
     ORDER BY ctl.archived_at DESC`,
  );
  res.json(rows.map(rowToCamel));
});

router.get('/:traineeId', async (req, res) => {
  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const { rows: formRows } = await pool.query('SELECT * FROM check_to_line_forms WHERE trainee_id = $1', [trainee.id]);
  // Pilot Check to Line items are an admin-editable catalog (form_key
  // CHECK_TO_LINE, one item set per fleet) - see Syllabus > Check Forms.
  // Cabin attendant items stay the fixed 6-item list in CtlForm.jsx.
  const { rows: itemRows } = trainee.type === 'CABIN_ATTENDANT'
    ? { rows: [] }
    : await pool.query(
      `SELECT * FROM check_form_items WHERE form_key = 'CHECK_TO_LINE' AND fleet = $1 AND archived = false
       ORDER BY sort_order ASC, created_at ASC`,
      [trainee.fleet],
    );
  res.json({
    form: formRows[0] ? rowToCamel(formRows[0]) : null,
    items: itemRows.map(rowToCamel),
    ntsMarkers: NTS_MARKERS,
  });
});

const upsertSchema = z.object({
  sectorDetails: z.record(z.any()).optional(),
  assessmentItems: z.record(z.any()).optional(),
  ntsScores: z.record(z.any()).optional(),
  comments: z.string().nullable().optional(),
  overallResult: z.enum(['PASS', 'FAIL']).nullable().optional(),
  overallScore: z.number().int().min(1).max(5).nullable().optional(),
  assessorSignature: z.string().nullable().optional(),
  candidateSignature: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

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
    return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can assign checks' });
  }
  // Snapshot name/ARN/role as plain text so they survive the assignee's
  // account later being deleted, instead of resolving them live off a join.
  const assignee = hasAssignedTo
    ? await resolveAssignee(d.assignedTo)
    : { assignedToName: null, assignedToArn: null, assignedToRole: null };

  const { rows } = await pool.query(
    `INSERT INTO check_to_line_forms
       (trainee_id, fleet, sector_details, assessment_items, nts_scores, comments,
        overall_result, overall_score, assessor_signature, candidate_signature, assigned_to, assigned_to_name, assigned_to_arn, assigned_to_role)
     VALUES ($1, $2, COALESCE($3, '{}'::jsonb), COALESCE($4, '{}'::jsonb), COALESCE($5, '{}'::jsonb), $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (trainee_id) DO UPDATE SET
       sector_details = COALESCE($3, check_to_line_forms.sector_details),
       assessment_items = COALESCE($4, check_to_line_forms.assessment_items),
       nts_scores = COALESCE($5, check_to_line_forms.nts_scores),
       comments = COALESCE($6, check_to_line_forms.comments),
       overall_result = COALESCE($7, check_to_line_forms.overall_result),
       overall_score = COALESCE($8, check_to_line_forms.overall_score),
       assessor_signature = COALESCE($9, check_to_line_forms.assessor_signature),
       candidate_signature = COALESCE($10, check_to_line_forms.candidate_signature),
       assigned_to = CASE WHEN $15 THEN $11::uuid ELSE check_to_line_forms.assigned_to END,
       assigned_to_name = CASE WHEN $15 THEN $12 ELSE check_to_line_forms.assigned_to_name END,
       assigned_to_arn = CASE WHEN $15 THEN $13 ELSE check_to_line_forms.assigned_to_arn END,
       assigned_to_role = CASE WHEN $15 THEN $14 ELSE check_to_line_forms.assigned_to_role END
     RETURNING *`,
    [
      trainee.id,
      trainee.fleet,
      d.sectorDetails ? JSON.stringify(d.sectorDetails) : null,
      d.assessmentItems ? JSON.stringify(d.assessmentItems) : null,
      d.ntsScores ? JSON.stringify(d.ntsScores) : null,
      d.comments ?? null,
      d.overallResult ?? null,
      d.overallScore ?? null,
      d.assessorSignature ?? null,
      d.candidateSignature ?? null,
      d.assignedTo ?? null,
      assignee.assignedToName,
      assignee.assignedToArn,
      assignee.assignedToRole,
      hasAssignedTo,
    ],
  );

  const form = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'check_to_line_forms', targetId: form.id });
  res.json(form);
});

router.post('/:traineeId/complete', async (req, res) => {
  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const { rows } = await pool.query('SELECT * FROM check_to_line_forms WHERE trainee_id = $1', [trainee.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'No CTL form to complete' });
  const form = rowToCamel(rows[0]);
  if (!form.overallResult) return res.status(400).json({ error: 'overallResult must be set before completing' });

  // Completing Check to Line finishes the trainee's LOFT package - it does
  // not archive the trainee record itself (that only happens once they're
  // actually promoted onto the Crew roster, see trainees.js
  // promote-to-crew, at which point the trainee record becomes redundant).
  const { rows: updatedRows } = await pool.query(
    'UPDATE check_to_line_forms SET completed_at = now() WHERE id = $1 RETURNING *',
    [form.id],
  );
  await logAction({ userId: req.user.id, action: 'COMPLETE', targetTable: 'check_to_line_forms', targetId: form.id });
  res.json(rowToCamel(updatedRows[0]));
});

router.post('/:traineeId/archive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can archive checks' });

  const { rows: existingRows } = await pool.query('SELECT * FROM check_to_line_forms WHERE trainee_id = $1', [req.params.traineeId]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'No CTL form found for this trainee' });
  const existing = rowToCamel(existingRows[0]);
  if (!existing.completedAt) return res.status(400).json({ error: 'Check to Line must be completed before it can be archived' });

  const { rows } = await pool.query(
    'UPDATE check_to_line_forms SET archived = true, archived_at = now() WHERE trainee_id = $1 RETURNING *',
    [req.params.traineeId],
  );
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'check_to_line_forms', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

router.post('/:traineeId/unarchive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can unarchive checks' });

  const { rows } = await pool.query(
    'UPDATE check_to_line_forms SET archived = false, archived_at = null WHERE trainee_id = $1 RETURNING *',
    [req.params.traineeId],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'No CTL form found for this trainee' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'check_to_line_forms', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

module.exports = router;
