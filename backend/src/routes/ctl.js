const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { NTS_MARKERS, itemsForFleet } = require('../../db/phase4-items');

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

  const { rows } = await pool.query('SELECT * FROM check_to_line_forms WHERE trainee_id = $1', [trainee.id]);
  res.json({
    form: rows[0] ? rowToCamel(rows[0]) : null,
    // The pilot Check to Line Assessment uses the exact same categorised
    // item catalogue as the Phase 4 assessment for that fleet (confirmed
    // identical across the SA_504/SA_512/SA_813 source documents).
    items: itemsForFleet(trainee.fleet),
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
});

router.put('/:traineeId', async (req, res) => {
  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const { rows } = await pool.query(
    `INSERT INTO check_to_line_forms
       (trainee_id, fleet, sector_details, assessment_items, nts_scores, comments,
        overall_result, overall_score, assessor_signature, candidate_signature)
     VALUES ($1, $2, COALESCE($3, '{}'::jsonb), COALESCE($4, '{}'::jsonb), COALESCE($5, '{}'::jsonb), $6, $7, $8, $9, $10)
     ON CONFLICT (trainee_id) DO UPDATE SET
       sector_details = COALESCE($3, check_to_line_forms.sector_details),
       assessment_items = COALESCE($4, check_to_line_forms.assessment_items),
       nts_scores = COALESCE($5, check_to_line_forms.nts_scores),
       comments = COALESCE($6, check_to_line_forms.comments),
       overall_result = COALESCE($7, check_to_line_forms.overall_result),
       overall_score = COALESCE($8, check_to_line_forms.overall_score),
       assessor_signature = COALESCE($9, check_to_line_forms.assessor_signature),
       candidate_signature = COALESCE($10, check_to_line_forms.candidate_signature)
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: updatedRows } = await client.query(
      'UPDATE check_to_line_forms SET completed_at = now() WHERE id = $1 RETURNING *',
      [form.id],
    );
    await client.query(
      'UPDATE trainees SET archived = true, archived_at = now() WHERE id = $1',
      [trainee.id],
    );
    await client.query('COMMIT');
    await logAction({ userId: req.user.id, action: 'COMPLETE', targetTable: 'check_to_line_forms', targetId: form.id });
    res.json(rowToCamel(updatedRows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

module.exports = router;
