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

  const { rows } = await pool.query('SELECT * FROM phase4_assessments WHERE trainee_id = $1', [trainee.id]);
  res.json({
    assessment: rows[0] ? rowToCamel(rows[0]) : null,
    items: itemsForFleet(trainee.fleet),
    ntsMarkers: NTS_MARKERS,
  });
});

const upsertSchema = z.object({
  sectorDetails: z.record(z.any()).optional(),
  itemResults: z.record(z.any()).optional(),
  ntsScores: z.record(z.any()).optional(),
  comments: z.string().nullable().optional(),
  trainingCaptainSignature: z.string().nullable().optional(),
  applicantSignature: z.string().nullable().optional(),
});

router.put('/:traineeId', async (req, res) => {
  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  // A trainee may only sign their own applicant signature - never the
  // Training Captain's - mirroring the phase-completions signature rule.
  if (req.user.role === 'TRAINEE') {
    if (req.user.trainee?.id !== trainee.id) return res.status(403).json({ error: 'Forbidden' });
    if (d.trainingCaptainSignature !== undefined) return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    `INSERT INTO phase4_assessments
       (trainee_id, sector_details, item_results, nts_scores, comments,
        training_captain_signature, applicant_signature)
     VALUES ($1, COALESCE($2, '{}'::jsonb), COALESCE($3, '{}'::jsonb), COALESCE($4, '{}'::jsonb), $5, $6, $7)
     ON CONFLICT (trainee_id) DO UPDATE SET
       sector_details = COALESCE($2, phase4_assessments.sector_details),
       item_results = COALESCE($3, phase4_assessments.item_results),
       nts_scores = COALESCE($4, phase4_assessments.nts_scores),
       comments = COALESCE($5, phase4_assessments.comments),
       training_captain_signature = COALESCE($6, phase4_assessments.training_captain_signature),
       applicant_signature = COALESCE($7, phase4_assessments.applicant_signature)
     RETURNING *`,
    [
      trainee.id,
      d.sectorDetails ? JSON.stringify(d.sectorDetails) : null,
      d.itemResults ? JSON.stringify(d.itemResults) : null,
      d.ntsScores ? JSON.stringify(d.ntsScores) : null,
      d.comments ?? null,
      d.trainingCaptainSignature ?? null,
      d.applicantSignature ?? null,
    ],
  );

  const assessment = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'phase4_assessments', targetId: assessment.id });
  res.json(assessment);
});

router.post('/:traineeId/complete', async (req, res) => {
  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const { rows } = await pool.query('SELECT * FROM phase4_assessments WHERE trainee_id = $1', [trainee.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'No Phase 4 assessment to complete' });
  const assessment = rowToCamel(rows[0]);
  if (!assessment.trainingCaptainSignature || !assessment.applicantSignature) {
    return res.status(400).json({ error: 'Both signatures are required before completing Phase 4' });
  }

  const { rows: updatedRows } = await pool.query(
    'UPDATE phase4_assessments SET completed_at = now() WHERE id = $1 RETURNING *',
    [assessment.id],
  );
  await logAction({ userId: req.user.id, action: 'COMPLETE', targetTable: 'phase4_assessments', targetId: assessment.id });
  res.json(rowToCamel(updatedRows[0]));
});

module.exports = router;
