const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessChecks, isAdmin } = require('../middleware/roles');
const { resolveAssignee } = require('../lib/assignee');
const { resolveCrewMember } = require('../lib/crew-member');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

// Recurrent Sim and Emergency Procedures: HOTC / HOFO / Flight Ops Admin / Examiner.
// Cabin Attendant Line Check: HOTC / CA Checker (mirrors the Flight Standards prototype).
// Simulator-only staff can additionally access Recurrent Sim (PC/IPC) only -
// no Emergency Procedures, Line Checks, or Check to Line.
function canAccessCheckType(user, checkType) {
  if (checkType === 'CABIN_ATTENDANT_LINE_CHECK') {
    return user.role === 'HOTC' || user.role === 'CA_CHECKER';
  }
  if (checkType === 'RECURRENT_SIMULATOR') {
    return canAccessChecks(user) || user.role === 'SIMULATOR_ONLY';
  }
  return canAccessChecks(user);
}

router.get('/', async (req, res) => {
  const { traineeId, crewMemberId, checkType, archived } = req.query;
  if (checkType && !canAccessCheckType(req.user, checkType)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (archived === 'true' && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const conditions = [`archived = $1`];
  const params = [archived === 'true'];
  if (traineeId) { params.push(traineeId); conditions.push(`trainee_id = $${params.length}`); }
  if (crewMemberId) { params.push(crewMemberId); conditions.push(`crew_member_id = $${params.length}`); }
  if (checkType) { params.push(checkType); conditions.push(`check_type = $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT * FROM checks WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );
  const checks = rows.map(rowToCamel);
  res.json(checks.filter((c) => canAccessCheckType(req.user, c.checkType)));
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM checks WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const check = rowToCamel(rows[0]);
  if (!canAccessCheckType(req.user, check.checkType)) return res.status(403).json({ error: 'Forbidden' });
  res.json(check);
});

const createSchema = z.object({
  traineeId: z.string().uuid().optional(),
  crewMemberId: z.string().uuid().optional(),
  checkType: z.enum(['RECURRENT_SIMULATOR', 'EMERGENCY_PROCEDURES', 'CABIN_ATTENDANT_LINE_CHECK', 'PILOT_LINE_CHECK']),
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
  // Snapshot the assignee's and crew member's name now, so they survive
  // either later being deleted from the system - plain text, not a live join.
  const assignee = await resolveAssignee(d.assignedTo);
  const crewMember = await resolveCrewMember(d.crewMemberId);
  const { rows } = await pool.query(
    `INSERT INTO checks (trainee_id, crew_member_id, crew_member_name, check_type, fleet, applies_to, due_date, assessor_name, assigned_to, assigned_to_name, assigned_to_arn, assigned_to_role, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [
      d.traineeId || null,
      d.crewMemberId || null,
      crewMember.crewMemberName,
      d.checkType,
      d.fleet || null,
      d.appliesTo,
      d.dueDate || null,
      d.assessorName || null,
      d.assignedTo || null,
      assignee.assignedToName,
      assignee.assignedToArn,
      assignee.assignedToRole,
      JSON.stringify(d.details || {}),
    ],
  );
  const check = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'checks', targetId: check.id });
  res.status(201).json(check);
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
  // Re-snapshot name/ARN/role whenever the assignee changes - stale otherwise.
  const assignee = hasAssignedTo
    ? await resolveAssignee(d.assignedTo)
    : { assignedToName: null, assignedToArn: null, assignedToRole: null };

  const { rows } = await pool.query(
    `UPDATE checks SET
       details = COALESCE($1, details),
       result = COALESCE($2, result),
       score = COALESCE($3, score),
       completed_at = COALESCE($4, completed_at),
       assessor_name = COALESCE($5, assessor_name),
       assigned_to = CASE WHEN $6 THEN $7::uuid ELSE assigned_to END,
       assigned_to_name = CASE WHEN $6 THEN $8 ELSE assigned_to_name END,
       assigned_to_arn = CASE WHEN $6 THEN $9 ELSE assigned_to_arn END,
       assigned_to_role = CASE WHEN $6 THEN $10 ELSE assigned_to_role END,
       completed_by = $11
     WHERE id = $12 RETURNING *`,
    [
      d.details ? JSON.stringify(d.details) : null,
      d.result ?? null,
      d.score ?? null,
      d.completedAt ? new Date(d.completedAt) : null,
      d.assessorName ?? null,
      hasAssignedTo,
      d.assignedTo ?? null,
      assignee.assignedToName,
      assignee.assignedToArn,
      assignee.assignedToRole,
      req.user.id,
      req.params.id,
    ],
  );
  const updated = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'checks', targetId: existing.id });
  res.json(updated);
});

router.post('/:id/archive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can archive checks' });

  const { rows: existingRows } = await pool.query('SELECT * FROM checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (!existing.result) return res.status(400).json({ error: 'Check must be completed (a result set) before it can be archived' });

  const { rows } = await pool.query(
    'UPDATE checks SET archived = true, archived_at = now() WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'checks', targetId: req.params.id });
  res.json(rowToCamel(rows[0]));
});

router.post('/:id/unarchive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can unarchive checks' });

  const { rows } = await pool.query(
    'UPDATE checks SET archived = false, archived_at = null WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'checks', targetId: req.params.id });
  res.json(rowToCamel(rows[0]));
});

// Deleting is permanent, unlike archiving - restricted to admins, and
// blocked once a check is archived (archived records are the historical
// record and should be unarchived first if they genuinely need removing).
router.delete('/:id', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can delete checks' });

  const { rows: existingRows } = await pool.query('SELECT * FROM checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (existing.archived) return res.status(400).json({ error: 'Archived checks cannot be deleted' });

  await pool.query('DELETE FROM checks WHERE id = $1', [req.params.id]);
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'checks', targetId: req.params.id });
  res.status(204).send();
});

module.exports = router;
