const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessChecks, isAdmin, GROUND_INSTRUCTOR_CHECK_ROLES } = require('../middleware/roles');
const { resolveAssignee } = require('../lib/assignee');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

async function findEligibleUser(userId) {
  const { rows } = await pool.query('SELECT id, name, role, arn FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) return null;
  const user = rowToCamel(rows[0]);
  if (!GROUND_INSTRUCTOR_CHECK_ROLES.includes(user.role)) return null;
  return user;
}

// Archive browse - across all instructors, mirrors checks.js/ctl.js.
router.get('/', async (req, res) => {
  if (req.query.archived === 'true') {
    if (!isAdmin(req.user)) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      `SELECT icc.*, u.name AS instructor_name, u.role AS instructor_role
       FROM instructor_competency_checks icc
       JOIN users u ON u.id = icc.user_id
       WHERE icc.archived = true
       ORDER BY icc.archived_at DESC`,
    );
    return res.json(rows.map(rowToCamel));
  }

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  if (!canAccessChecks(req.user) && req.user.id !== userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM instructor_competency_checks WHERE user_id = $1 AND archived = false ORDER BY created_at DESC',
    [userId],
  );
  res.json(rows.map(rowToCamel));
});

const createSchema = z.object({
  userId: z.string().uuid(),
  courseTitle: z.string().optional(),
  dateOfObservation: z.string().optional(),
  assessorName: z.string().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
});

router.post('/', async (req, res) => {
  if (!canAccessChecks(req.user)) return res.status(403).json({ error: 'Forbidden' });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const instructor = await findEligibleUser(d.userId);
  if (!instructor) return res.status(400).json({ error: 'Not an eligible instructor (must be HOTC, HOFO, Flight Ops Admin or Examiner)' });
  if (d.assignedTo && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can assign checks' });
  }
  const assignee = await resolveAssignee(d.assignedTo);

  const { rows } = await pool.query(
    `INSERT INTO instructor_competency_checks
       (user_id, course_title, date_of_observation, assessor_name, assigned_to, assigned_to_name, assigned_to_arn, assigned_to_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      d.userId,
      d.courseTitle || null,
      d.dateOfObservation || null,
      d.assessorName || null,
      d.assignedTo || null,
      assignee.assignedToName,
      assignee.assignedToArn,
      assignee.assignedToRole,
    ],
  );
  const check = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'instructor_competency_checks', targetId: check.id });
  res.status(201).json(check);
});

const updateSchema = z.object({
  courseTitle: z.string().nullable().optional(),
  dateOfObservation: z.string().nullable().optional(),
  assessorName: z.string().nullable().optional(),
  items: z.record(z.any()).optional(),
  assessorSignature: z.string().nullable().optional(),
  assessorPrintedName: z.string().nullable().optional(),
  assessorSignedDate: z.string().nullable().optional(),
  instructorSignature: z.string().nullable().optional(),
  instructorPrintedName: z.string().nullable().optional(),
  instructorSignedDate: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

router.patch('/:id', async (req, res) => {
  if (!canAccessChecks(req.user)) return res.status(403).json({ error: 'Forbidden' });
  const { rows: existingRows } = await pool.query('SELECT * FROM instructor_competency_checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const hasAssignedTo = Object.prototype.hasOwnProperty.call(req.body, 'assignedTo');
  if (hasAssignedTo && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can assign checks' });
  }
  const assignee = hasAssignedTo
    ? await resolveAssignee(d.assignedTo)
    : { assignedToName: null, assignedToArn: null, assignedToRole: null };

  const { rows } = await pool.query(
    `UPDATE instructor_competency_checks SET
       course_title = COALESCE($1, course_title),
       date_of_observation = COALESCE($2, date_of_observation),
       assessor_name = COALESCE($3, assessor_name),
       items = COALESCE($4, items),
       assessor_signature = COALESCE($5, assessor_signature),
       assessor_printed_name = COALESCE($6, assessor_printed_name),
       assessor_signed_date = COALESCE($7, assessor_signed_date),
       instructor_signature = COALESCE($8, instructor_signature),
       instructor_printed_name = COALESCE($9, instructor_printed_name),
       instructor_signed_date = COALESCE($10, instructor_signed_date),
       assigned_to = CASE WHEN $11 THEN $12::uuid ELSE assigned_to END,
       assigned_to_name = CASE WHEN $11 THEN $13 ELSE assigned_to_name END,
       assigned_to_arn = CASE WHEN $11 THEN $14 ELSE assigned_to_arn END,
       assigned_to_role = CASE WHEN $11 THEN $15 ELSE assigned_to_role END,
       completed_at = COALESCE($16, completed_at)
     WHERE id = $17 RETURNING *`,
    [
      d.courseTitle ?? null,
      d.dateOfObservation ?? null,
      d.assessorName ?? null,
      d.items ? JSON.stringify(d.items) : null,
      d.assessorSignature ?? null,
      d.assessorPrintedName ?? null,
      d.assessorSignedDate ?? null,
      d.instructorSignature ?? null,
      d.instructorPrintedName ?? null,
      d.instructorSignedDate ?? null,
      hasAssignedTo,
      d.assignedTo ?? null,
      assignee.assignedToName,
      assignee.assignedToArn,
      assignee.assignedToRole,
      d.completedAt ? new Date(d.completedAt) : null,
      req.params.id,
    ],
  );
  const updated = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'instructor_competency_checks', targetId: updated.id });
  res.json(updated);
});

router.post('/:id/archive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can archive checks' });
  const { rows: existingRows } = await pool.query('SELECT * FROM instructor_competency_checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (!existing.completedAt) return res.status(400).json({ error: 'Check must be completed before it can be archived' });

  const { rows } = await pool.query(
    'UPDATE instructor_competency_checks SET archived = true, archived_at = now() WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'instructor_competency_checks', targetId: req.params.id });
  res.json(rowToCamel(rows[0]));
});

router.post('/:id/unarchive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can unarchive checks' });
  const { rows } = await pool.query(
    'UPDATE instructor_competency_checks SET archived = false, archived_at = null WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'instructor_competency_checks', targetId: req.params.id });
  res.json(rowToCamel(rows[0]));
});

module.exports = router;
