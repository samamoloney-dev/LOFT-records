const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessChecks, isAdmin, PERSONNEL_AIR_COMPETENCY_ROLES, PERSONNEL_AIR_COMPETENCY_SECTION } = require('../middleware/roles');
const { resolveAssignee } = require('../lib/assignee');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

async function findEligibleUser(userId) {
  const { rows } = await pool.query('SELECT id, name, role, arn FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) return null;
  const user = rowToCamel(rows[0]);
  if (!PERSONNEL_AIR_COMPETENCY_ROLES.includes(user.role)) return null;
  return user;
}

// Archive browse - across all candidates, mirrors instructor-checks.js.
router.get('/', async (req, res) => {
  if (req.query.archived === 'true') {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      `SELECT pcc.*, u.name AS candidate_name, u.role AS candidate_role
       FROM personnel_competency_checks pcc
       JOIN users u ON u.id = pcc.user_id
       WHERE pcc.archived = true
       ORDER BY pcc.archived_at DESC`,
    );
    return res.json(rows.map(rowToCamel));
  }

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!canAccessChecks(req.user) && req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM personnel_competency_checks WHERE user_id = $1 AND archived = false ORDER BY created_at DESC',
    [userId],
  );
  res.json(rows.map(rowToCamel));
});

const createSchema = z.object({
  userId: z.string().uuid(),
});

router.post('/', async (req, res) => {
  if (!canAccessChecks(req.user)) return res.status(403).json({ error: 'Forbidden' });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const candidate = await findEligibleUser(d.userId);
  if (!candidate) return res.status(400).json({ error: 'Not an eligible candidate (must be Training Captain, Check Captain, CA Trainer or CA Checker)' });
  const candidateSection = PERSONNEL_AIR_COMPETENCY_SECTION[candidate.role];

  const { rows } = await pool.query(
    `INSERT INTO personnel_competency_checks (user_id, candidate_section)
     VALUES ($1, $2) RETURNING *`,
    [d.userId, candidateSection],
  );
  const check = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'personnel_competency_checks', targetId: check.id });
  res.status(201).json(check);
});

const updateSchema = z.object({
  trainingCheckType: z.string().nullable().optional(),
  checkDate: z.string().nullable().optional(),
  aircraftType: z.string().nullable().optional(),
  assessorId: z.string().uuid().nullable().optional(),
  items: z.record(z.any()).optional(),
  comments: z.string().nullable().optional(),
  recommendations: z.string().nullable().optional(),
  certifiedSignature: z.string().nullable().optional(),
  certifiedSignedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

router.patch('/:id', async (req, res) => {
  if (!canAccessChecks(req.user)) return res.status(403).json({ error: 'Forbidden' });
  const { rows: existingRows } = await pool.query('SELECT * FROM personnel_competency_checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const hasAssessorId = Object.prototype.hasOwnProperty.call(req.body, 'assessorId');
  const assessee = hasAssessorId
    ? await resolveAssignee(d.assessorId)
    : { assignedToName: null, assignedToArn: null };

  // certifiedSignature/certifiedSignedAt/completedAt use explicit-presence
  // flags rather than COALESCE - PinSignature's "Clear" button sends a real
  // null to un-sign a check, which COALESCE would silently ignore (it only
  // overwrites when the incoming value is non-null).
  const hasCertifiedSignature = Object.prototype.hasOwnProperty.call(req.body, 'certifiedSignature');
  const hasCertifiedSignedAt = Object.prototype.hasOwnProperty.call(req.body, 'certifiedSignedAt');
  const hasCompletedAt = Object.prototype.hasOwnProperty.call(req.body, 'completedAt');

  const { rows } = await pool.query(
    `UPDATE personnel_competency_checks SET
       training_check_type = COALESCE($1, training_check_type),
       check_date = COALESCE($2, check_date),
       aircraft_type = COALESCE($3, aircraft_type),
       assessor_id = CASE WHEN $4 THEN $5::uuid ELSE assessor_id END,
       assessor_name = CASE WHEN $4 THEN $6 ELSE assessor_name END,
       assessor_arn = CASE WHEN $4 THEN $7 ELSE assessor_arn END,
       items = COALESCE($8, items),
       comments = COALESCE($9, comments),
       recommendations = COALESCE($10, recommendations),
       certified_signature = CASE WHEN $11 THEN $12 ELSE certified_signature END,
       certified_signed_at = CASE WHEN $13 THEN $14::timestamptz ELSE certified_signed_at END,
       completed_at = CASE WHEN $15 THEN $16::timestamptz ELSE completed_at END
     WHERE id = $17 RETURNING *`,
    [
      d.trainingCheckType ?? null,
      d.checkDate ?? null,
      d.aircraftType ?? null,
      hasAssessorId,
      d.assessorId ?? null,
      assessee.assignedToName,
      assessee.assignedToArn,
      d.items ? JSON.stringify(d.items) : null,
      d.comments ?? null,
      d.recommendations ?? null,
      hasCertifiedSignature,
      d.certifiedSignature ?? null,
      hasCertifiedSignedAt,
      d.certifiedSignedAt ? new Date(d.certifiedSignedAt) : null,
      hasCompletedAt,
      d.completedAt ? new Date(d.completedAt) : null,
      req.params.id,
    ],
  );
  const updated = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'personnel_competency_checks', targetId: updated.id });
  res.json(updated);
});

router.post('/:id/archive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can archive checks' });
  const { rows: existingRows } = await pool.query('SELECT * FROM personnel_competency_checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (!existing.completedAt) return res.status(400).json({ error: 'Check must be completed before it can be archived' });

  const { rows } = await pool.query(
    'UPDATE personnel_competency_checks SET archived = true, archived_at = now() WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'personnel_competency_checks', targetId: req.params.id });
  res.json(rowToCamel(rows[0]));
});

router.post('/:id/unarchive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can unarchive checks' });
  const { rows } = await pool.query(
    'UPDATE personnel_competency_checks SET archived = false, archived_at = null WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'personnel_competency_checks', targetId: req.params.id });
  res.json(rowToCamel(rows[0]));
});

module.exports = router;
