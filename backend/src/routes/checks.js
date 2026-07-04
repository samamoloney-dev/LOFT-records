const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessChecks, isAdmin } = require('../middleware/roles');
const { resolveAssignee } = require('../lib/assignee');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

// Recurrent Sim and Emergency Procedures: HOTC / HOFO / Flight Ops Admin / Examiner.
// Cabin Attendant Line Check: HOTC / CA Checker (mirrors the Flight Standards prototype).
function canAccessCheckType(user, checkType) {
  if (checkType === 'CABIN_ATTENDANT_LINE_CHECK') {
    return user.role === 'HOTC' || user.role === 'CA_CHECKER';
  }
  return canAccessChecks(user);
}

router.get('/', async (req, res) => {
  const { traineeId, checkType } = req.query;
  if (checkType && !canAccessCheckType(req.user, checkType)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const conditions = [];
  const params = [];
  if (traineeId) { params.push(traineeId); conditions.push(`c.trainee_id = $${params.length}`); }
  if (checkType) { params.push(checkType); conditions.push(`c.check_type = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT c.*, au.name AS assigned_to_name, au.arn AS assigned_to_arn
     FROM checks c
     LEFT JOIN users au ON au.id = c.assigned_to
     ${where}
     ORDER BY c.created_at DESC`,
    params,
  );
  const checks = rows.map(rowToCamel);
  res.json(checks.filter((c) => canAccessCheckType(req.user, c.checkType)));
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, au.name AS assigned_to_name, au.arn AS assigned_to_arn
     FROM checks c
     LEFT JOIN users au ON au.id = c.assigned_to
     WHERE c.id = $1`,
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const check = rowToCamel(rows[0]);
  if (!canAccessCheckType(req.user, check.checkType)) return res.status(403).json({ error: 'Forbidden' });
  res.json(check);
});

const createSchema = z.object({
  traineeId: z.string().uuid().optional(),
  checkType: z.enum(['RECURRENT_SIMULATOR', 'EMERGENCY_PROCEDURES', 'CABIN_ATTENDANT_LINE_CHECK']),
  fleet: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']).optional(),
  appliesTo: z.enum(['PILOT', 'CABIN_ATTENDANT']),
  dueDate: z.string().optional(),
  assessorName: z.string().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  details: z.record(z.any()).optional(),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!canAccessCheckType(req.user, parsed.data.checkType)) return res.status(403).json({ error: 'Forbidden' });
  if (parsed.data.assignedTo && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can assign checks' });
  }

  const d = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO checks (trainee_id, check_type, fleet, applies_to, due_date, assessor_name, assigned_to, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      d.traineeId || null,
      d.checkType,
      d.fleet || null,
      d.appliesTo,
      d.dueDate || null,
      d.assessorName || null,
      d.assignedTo || null,
      JSON.stringify(d.details || {}),
    ],
  );
  const check = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'checks', targetId: check.id });
  res.status(201).json({ ...check, ...(await resolveAssignee(check.assignedTo)) });
});

const updateSchema = z.object({
  details: z.record(z.any()).optional(),
  result: z.enum(['PASS', 'FAIL']).nullable().optional(),
  score: z.number().int().min(1).max(5).nullable().optional(),
  completedAt: z.string().nullable().optional(),
  assessorName: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

router.patch('/:id', async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (!canAccessCheckType(req.user, existing.checkType)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  // Distinguish "assignedTo not sent, leave as-is" from "assignedTo: null,
  // unassign" - zod would otherwise turn both into undefined.
  const hasAssignedTo = Object.prototype.hasOwnProperty.call(req.body, 'assignedTo');
  if (hasAssignedTo && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can assign checks' });
  }

  const { rows } = await pool.query(
    `UPDATE checks SET
       details = COALESCE($1, details),
       result = COALESCE($2, result),
       score = COALESCE($3, score),
       completed_at = COALESCE($4, completed_at),
       assessor_name = COALESCE($5, assessor_name),
       assigned_to = CASE WHEN $6 THEN $7::uuid ELSE assigned_to END,
       completed_by = $8
     WHERE id = $9 RETURNING *`,
    [
      d.details ? JSON.stringify(d.details) : null,
      d.result ?? null,
      d.score ?? null,
      d.completedAt ? new Date(d.completedAt) : null,
      d.assessorName ?? null,
      hasAssignedTo,
      d.assignedTo ?? null,
      req.user.id,
      req.params.id,
    ],
  );
  const updated = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'checks', targetId: existing.id });
  res.json({ ...updated, ...(await resolveAssignee(updated.assignedTo)) });
});

module.exports = router;
