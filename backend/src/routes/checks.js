const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessChecks, isAdmin, UPGRADE_CHECKER_ROLES, UPGRADE_VARIANTS, PERSONNEL_AIR_COMPETENCY_SECTION } = require('../middleware/roles');
const { resolveAssignee } = require('../lib/assignee');
const { resolveCrewMember } = require('../lib/crew-member');
const { logAction } = require('../lib/audit');
const { localDateString } = require('../lib/currency');

const router = express.Router();

router.use(requireAuth);

// Recurrent Sim and Emergency Procedures: HOTC / HOFO / Flight Ops Admin / Examiner.
// Cabin Attendant Line Check: HOTC / CA Checker / CA Manager (mirrors the
// Flight Standards prototype).
// Simulator-only staff can additionally access Recurrent Sim (PC/IPC) only -
// no Emergency Procedures, Line Checks, or Check to Line.
function canAccessCheckType(user, checkType) {
  if (checkType === 'CABIN_ATTENDANT_LINE_CHECK') {
    return user.role === 'HOTC' || user.role === 'CA_CHECKER' || user.role === 'CA_MANAGER';
  }
  if (checkType === 'RECURRENT_SIMULATOR') {
    return canAccessChecks(user) || user.role === 'SIMULATOR_ONLY';
  }
  if (checkType === 'EMERGENCY_PROCEDURES') {
    // Cabin Attendant Manager is authorised to train and check Emergency
    // Procedures for all pilots and cabin crew, unconditionally - not just
    // when ticked on their staff profile (that tick system is for everyone
    // else, see the checkAccess branch below).
    if (user.role === 'CA_MANAGER') return true;
    // Anyone else ticked for Emergency Procedures on their staff profile
    // (Staff tab checkAccess) is authorised to actually fill in and complete
    // an EP check they're assigned to, not just appear as a selectable
    // assessor for one - mirrors AssessorPicker/isEligibleForCheck, which
    // already treats that tick as full EP authority.
    return canAccessChecks(user) || (user.checkAccess || []).includes('EMERGENCY_PROCEDURES');
  }
  if (checkType === 'PILOT_LINE_CHECK') {
    // Check Captain is the role whose entire purpose is conducting Line
    // Checks, but CC isn't one of the blanket-access CHECK_ROLES (that list
    // is HOTC/HOFO/Alternate/Examiner only) - without this, a Check Captain
    // ticked for Line Check on their staff profile (Staff tab checkAccess)
    // could appear in the assessor picker but be rejected the moment they
    // actually tried to open/complete the check, since canAccessChecks alone
    // never recognised the tick. Reported live for Garry Underwood. Mirrors
    // the EMERGENCY_PROCEDURES tick-based branch above.
    return canAccessChecks(user) || (user.checkAccess || []).includes('LINE_CHECK');
  }
  if (checkType === 'UPGRADE_RECORD') {
    return isAdmin(user) || UPGRADE_CHECKER_ROLES.includes(user.role);
  }
  return canAccessChecks(user);
}

// A Training Captain/Examiner who conducts an IPC/PC from the "Other Seat"
// (the jump/observer position, per the seat-check note on that form)
// demonstrates their own Right Hand Seat currency by doing so - if they
// have a linked crew profile (see crew.js CREW_SELECT/user_id), their
// "Right Hand Seat" competency is auto-revalidated on a rolling 12-month
// basis rather than needing to be updated by hand. No-op if unlinked.
async function revalidateRhsCompetency(assignedToUserId, completedAt) {
  const { rows: crewRows } = await pool.query('SELECT id FROM crew_members WHERE user_id = $1', [assignedToUserId]);
  if (crewRows.length === 0) return;
  const crewMemberId = crewRows[0].id;

  const completed = completedAt ? new Date(completedAt) : new Date();
  const due = new Date(completed);
  due.setDate(due.getDate() + 365);

  const { rows: existing } = await pool.query(
    `SELECT id FROM crew_competencies WHERE crew_member_id = $1 AND name = 'Right Hand Seat' AND archived = false`,
    [crewMemberId],
  );
  if (existing.length > 0) {
    await pool.query('UPDATE crew_competencies SET completed_date = $1, due_date = $2 WHERE id = $3', [completed, due, existing[0].id]);
  } else {
    await pool.query(
      `INSERT INTO crew_competencies (crew_member_id, name, completed_date, due_date) VALUES ($1, 'Right Hand Seat', $2, $3)`,
      [crewMemberId, completed, due],
    );
  }
}

// Archived crew records must be retained unaltered - blocks editing a check
// belonging to a crew member who has since left the company (see crew.js's
// own assertNotArchived for the matching guard on the crew profile itself).
async function isCrewMemberArchived(crewMemberId) {
  const { rows } = await pool.query('SELECT archived FROM crew_members WHERE id = $1', [crewMemberId]);
  return rows[0]?.archived === true;
}

const CHECK_TYPE_LABELS = {
  RECURRENT_SIMULATOR: 'Recurrent Simulator Check',
  EMERGENCY_PROCEDURES: 'Emergency Procedures',
  CABIN_ATTENDANT_LINE_CHECK: 'Cabin Attendant Line Check',
  PILOT_LINE_CHECK: 'Pilot Line Check',
  CAPTAIN_IN_TRAINING: 'Captain in Training Assessment',
  UPGRADE_RECORD: 'Upgrade Record',
};

// The Check tier requires already holding the Training tier (or already
// being a trainer/checker on a different fleet) - mirrors
// UpgradePicker.jsx's own REQUIRED_PRIOR_ROLES, enforced here too since
// that's just client-side filtering. No entry for TRAINING_CAPTAIN/
// TRAINING_CABIN_ATTENDANT - those are the entry-level upgrade, open to
// any line Captain/Cabin Attendant.
const REQUIRED_PRIOR_ROLES = {
  CHECK_CAPTAIN: ['TRAINING_CAPTAIN', 'CC'],
  CHECK_CABIN_ATTENDANT: ['CA_TRAINER', 'CA_CHECKER'],
};

// checks.crew_member_name is snapshotted at creation (see createCheckRecord
// below), but there's no equivalent trainee-name column - falls back to a
// quick lookup for the (rarer) trainee-scoped checks, e.g. Captain in
// Training assessments created against a trainee rather than crew.
async function checkSubjectName(check) {
  if (check.crewMemberName) return check.crewMemberName;
  if (check.traineeId) {
    const { rows } = await pool.query('SELECT first_name, last_name FROM trainees WHERE id = $1', [check.traineeId]);
    if (rows[0]) return `${rows[0].first_name} ${rows[0].last_name}`;
  }
  return 'an unlinked candidate';
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

// IPC/PC share one checkType (RECURRENT_SIMULATOR) distinguished only by
// details.variant (see ProficiencyChecks.jsx) - every other alert-eligible
// checkType maps to one label directly.
function alertLabelFor(checkType, details) {
  if (checkType === 'RECURRENT_SIMULATOR') return details?.variant === 'IPC_PC' ? 'IPC' : 'PC';
  return CHECK_TYPE_LABELS[checkType] || checkType;
}

// Recently-completed IPC/PC/EP/Line Check/Check to Line checks that haven't
// been marked reviewed yet - drives the red alert on the Checks nav tab
// telling an admin there's a completed check whose crew record needs
// updating. Spans both the checks table (IPC/PC/EP/Line Check) and
// check_to_line_forms (a separate table, see ctl.js) since both represent
// the same kind of "just finished, go act on it" event. Returns a
// breakdown by check type too, so the alert can say e.g. "2 IPC, 1
// Emergency Procedures" instead of just a bare count.
router.get('/alerts/count', async (req, res) => {
  const { rows: checkRows } = await pool.query(
    `SELECT check_type, details FROM checks
     WHERE completed_at IS NOT NULL AND reviewed_at IS NULL AND archived = false
       AND check_type IN ('EMERGENCY_PROCEDURES', 'RECURRENT_SIMULATOR', 'PILOT_LINE_CHECK', 'CABIN_ATTENDANT_LINE_CHECK')`,
  );
  const { rows: ctlRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM check_to_line_forms WHERE completed_at IS NOT NULL AND reviewed_at IS NULL AND archived = false`,
  );

  const counts = new Map();
  for (const row of checkRows) {
    const label = alertLabelFor(row.check_type, row.details);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  if (ctlRows[0].n > 0) counts.set('Check to Line', ctlRows[0].n);

  res.json({
    count: checkRows.length + ctlRows[0].n,
    breakdown: [...counts.entries()].map(([label, n]) => ({ label, count: n })),
  });
});

router.post('/alerts/mark-reviewed', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can dismiss this alert' });
  await pool.query(
    `UPDATE checks SET reviewed_at = now()
     WHERE completed_at IS NOT NULL AND reviewed_at IS NULL
       AND check_type IN ('EMERGENCY_PROCEDURES', 'RECURRENT_SIMULATOR', 'PILOT_LINE_CHECK', 'CABIN_ATTENDANT_LINE_CHECK')`,
  );
  await pool.query(`UPDATE check_to_line_forms SET reviewed_at = now() WHERE completed_at IS NOT NULL AND reviewed_at IS NULL`);
  res.json({ count: 0 });
});

// Whole calendar days between two YYYY-MM-DD date strings (not real elapsed
// time) - both sides are plain calendar dates (details.date, the date the
// check was actually scheduled for - see createCheckRecord/
// ProficiencyChecks.jsx, which always set this - not the due_date column,
// which this creation path leaves null), so this is deliberately pure date
// arithmetic rather than anything instant/timezone-based.
function daysBetweenDates(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toStr.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

// A check form still not completed more than a day after the date it was
// actually scheduled for - per the operator's explicit rule, this has to
// reach the assigned examiner/check pilot directly (see
// OverdueCheckAlert.jsx), not just sit in an admin-only report they might
// never open. "Today" is Australia/Perth (see currency.js's
// localDateString), matching every other due-date calculation in this app,
// rather than the server's own UTC clock.
//
// Covers the four recurrent check types (details.date - see
// daysBetweenDates' own comment) and Check to Line (check_to_line_forms),
// per the operator's explicit request that this also apply to CTL. Unlike
// the recurrent checks, a CTL form has no single scheduled date - it's
// filled in progressively over weeks of line training, not booked with an
// examiner for one day - so per the operator's explicit choice its trigger
// is instead the most recent flight sector date logged on the form
// (sector_details.sectors12/34.date, see CtlForm.jsx) still sitting
// uncompleted a day later. That catches a CTL that's actually finished
// flying but never signed off, without falsely flagging one still
// genuinely mid-training with no recent sector yet.
router.get('/alerts/overdue-completion', async (req, res) => {
  const { rows: checkRows } = await pool.query(
    `SELECT id, crew_member_id, check_type, details, crew_member_name, assigned_to, assigned_to_name
     FROM checks
     WHERE completed_at IS NULL AND archived = false
       AND check_type IN ('EMERGENCY_PROCEDURES', 'RECURRENT_SIMULATOR', 'PILOT_LINE_CHECK', 'CABIN_ATTENDANT_LINE_CHECK')`,
  );
  const { rows: ctlRows } = await pool.query(
    `SELECT ctl.id, ctl.trainee_id, ctl.sector_details, ctl.assigned_to, ctl.assigned_to_name,
            t.first_name, t.last_name
     FROM check_to_line_forms ctl
     JOIN trainees t ON t.id = ctl.trainee_id
     WHERE ctl.completed_at IS NULL AND ctl.archived = false`,
  );

  const today = localDateString();
  const overdueChecks = checkRows
    .map(rowToCamel)
    .filter((c) => c.details?.date && daysBetweenDates(c.details.date, today) >= 1)
    .map((c) => ({
      id: c.id,
      label: alertLabelFor(c.checkType, c.details),
      subjectName: c.crewMemberName,
      scheduledDate: c.details.date,
      daysOverdue: daysBetweenDates(c.details.date, today),
      assignedTo: c.assignedTo,
      assignedToName: c.assignedToName,
      linkTo: `/crew/${c.crewMemberId}?top=currency`,
    }));
  const overdueCtl = ctlRows
    .map(rowToCamel)
    .map((c) => {
      const sectors = c.sectorDetails || {};
      const lastSectorDate = [sectors.sectors12?.date, sectors.sectors34?.date].filter(Boolean).sort().pop();
      return { ...c, lastSectorDate };
    })
    .filter((c) => c.lastSectorDate && daysBetweenDates(c.lastSectorDate, today) >= 1)
    .map((c) => ({
      id: c.id,
      label: 'Check to Line',
      subjectName: `${c.firstName} ${c.lastName}`,
      scheduledDate: c.lastSectorDate,
      daysOverdue: daysBetweenDates(c.lastSectorDate, today),
      assignedTo: c.assignedTo,
      assignedToName: c.assignedToName,
      linkTo: `/trainees/${c.traineeId}`,
    }));
  const overdue = [...overdueChecks, ...overdueCtl].sort((a, b) => b.daysOverdue - a.daysOverdue);

  res.json({
    mine: overdue.filter((c) => c.assignedTo === req.user.id),
    // Full roster-wide view for admins (who's responsible for what, even
    // checks assigned to someone else or to no one) - everyone else only
    // ever sees their own, via `mine` above.
    all: isAdmin(req.user) ? overdue : [],
  });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM checks WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  const check = rowToCamel(rows[0]);
  if (!canAccessCheckType(req.user, check.checkType)) return res.status(403).json({ error: 'Forbidden' });
  // Matches GET /'s own archived=true gate - a non-admin can't browse the
  // archive list, so fetching one of those checks directly by id shouldn't
  // be a back door around that either.
  if (check.archived && !isAdmin(req.user)) return res.status(403).json({ error: 'Forbidden' });
  res.json(check);
});

const createSchema = z.object({
  traineeId: z.string().uuid().optional(),
  crewMemberId: z.string().uuid().optional(),
  checkType: z.enum(['RECURRENT_SIMULATOR', 'EMERGENCY_PROCEDURES', 'CABIN_ATTENDANT_LINE_CHECK', 'PILOT_LINE_CHECK', 'CAPTAIN_IN_TRAINING', 'UPGRADE_RECORD']),
  fleet: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']).optional(),
  appliesTo: z.enum(['PILOT', 'CABIN_ATTENDANT']),
  dueDate: z.string().optional(),
  assessorName: z.string().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  details: z.record(z.any()).optional(),
});

// Shared by the POST route below and by the Planning tab's auto-create (see
// crew.js planned-checks handler) - snapshots the assignee's and crew
// member's name now, so they survive either later being deleted from the
// system (plain text, not a live join).
async function createCheckRecord(d) {
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
  return rowToCamel(rows[0]);
}

// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new check
// record, regardless of check type - no other staff role, per the
// operator's explicit rule. Whoever it's then assigned to (an examiner,
// CA Checker, etc. - still governed by canAccessCheckType/checkAccess
// ticks) is who actually conducts and completes it.
// Upgrade Records are the one deliberate exception - checkers and
// examiners start these themselves ("select staff to upgrade"), not just
// get assigned to one an admin already created, per the operator's
// explicit request for this check type specifically.
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const canCreate = parsed.data.checkType === 'UPGRADE_RECORD'
    ? isAdmin(req.user) || UPGRADE_CHECKER_ROLES.includes(req.user.role)
    : isAdmin(req.user);
  if (!canCreate) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can add a check' });

  if (parsed.data.crewMemberId && await isCrewMemberArchived(parsed.data.crewMemberId)) {
    return res.status(403).json({ error: 'This crew member is archived - their records cannot be edited' });
  }
  // Captain in Training is only ever offered for a candidate already on the
  // Captain track - either an already-qualified First Officer an admin has
  // explicitly allocated to a Captain upgrade (crew_members.captain_in_training,
  // see crew.js), or a LOFT trainee entered as a Captain candidate from the
  // start (trainees.role === 'CAPTAIN', see trainees.js) - not something
  // anyone can start ad hoc for any pilot.
  if (parsed.data.checkType === 'CAPTAIN_IN_TRAINING') {
    let eligible = false;
    if (parsed.data.crewMemberId) {
      const { rows } = await pool.query('SELECT captain_in_training FROM crew_members WHERE id = $1', [parsed.data.crewMemberId]);
      eligible = !!rows[0]?.captain_in_training;
    } else if (parsed.data.traineeId) {
      const { rows } = await pool.query('SELECT role FROM trainees WHERE id = $1', [parsed.data.traineeId]);
      eligible = rows[0]?.role === 'CAPTAIN';
    }
    if (!eligible) {
      return res.status(403).json({ error: 'This candidate has not been allocated to Captain in Training' });
    }
  }
  // Check Captain/Check Cabin Attendant upgrades require the candidate
  // already hold the Training tier first (or already be a trainer/checker
  // on a different fleet, e.g. an existing Check Captain picking up a new
  // type) - per the operator's explicit rule, a plain line Captain/Cabin
  // Attendant can't be upgraded straight to Check. Mirrors
  // UpgradePicker.jsx's REQUIRED_PRIOR_ROLES, enforced here too since the
  // picker is just client-side filtering.
  if (parsed.data.checkType === 'UPGRADE_RECORD' && parsed.data.crewMemberId) {
    const requiredPrior = REQUIRED_PRIOR_ROLES[parsed.data.details?.variant];
    if (requiredPrior) {
      const { rows } = await pool.query(
        `SELECT u.role FROM crew_members cm JOIN users u ON u.id = cm.user_id WHERE cm.id = $1`,
        [parsed.data.crewMemberId],
      );
      if (!requiredPrior.includes(rows[0]?.role)) {
        return res.status(403).json({ error: 'This candidate must already hold the Training tier (or be a trainer/checker on another fleet) before this upgrade' });
      }
    }
  }

  const check = await createCheckRecord(parsed.data);
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'checks', targetId: check.id,
    description: `Created ${CHECK_TYPE_LABELS[check.checkType] || check.checkType} for ${await checkSubjectName(check)}`,
  });
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
  if (existing.crewMemberId && await isCrewMemberArchived(existing.crewMemberId)) {
    return res.status(403).json({ error: 'This crew member is archived - their records cannot be edited' });
  }
  // Once a check has a named assignee, only that person may fill it in,
  // complete it, and sign it - a colleague who also happens to hold
  // general access to this check type is not a substitute. Admins keep an
  // override (e.g. to fix a mistake or reassign it), same as every other
  // admin-only exception in this app.
  if (existing.assignedTo && existing.assignedTo !== req.user.id && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'Only the assigned examiner can complete and sign this check' });
  }

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

  const updateSql = `UPDATE checks SET
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
     WHERE id = $12 RETURNING *`;
  const updateParams = [
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
  ];

  let updated;
  let superseded = [];
  // Setting a result is what triggers "supersede whatever was previously
  // current" below - serialized per crew member/check type(/variant) with
  // an advisory lock (released automatically at COMMIT/ROLLBACK) so two
  // near-simultaneous completions of duplicate check rows for the same
  // crew member (e.g. a double-submitted "create check" click, each then
  // completed close together) can't each see the other's freshly-set
  // result and archive it - without this, both ended up archived, leaving
  // lastCompletedCheck reading "never completed" right after two checks
  // were just completed. Every other PATCH call (autosaving items/details
  // while a form is still being filled in - the vast majority of calls to
  // this route) skips the lock/transaction entirely, unchanged from before.
  if (d.result && existing.crewMemberId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${existing.crewMemberId}:${existing.checkType}:${existing.details?.variant || ''}`],
      );
      const { rows } = await client.query(updateSql, updateParams);
      updated = rowToCamel(rows[0]);

      const supersedeParams = [updated.checkType, updated.crewMemberId, updated.id];
      let variantClause = '';
      // RECURRENT_SIMULATOR shares one checkType across PC/IPC, and
      // UPGRADE_RECORD shares one checkType across all four upgrade variants -
      // both need the variant match too, or completing e.g. a Check Captain
      // Upgrade would wrongly archive that same crew member's already-completed
      // (and unrelated) Training Captain Upgrade record.
      if (updated.checkType === 'RECURRENT_SIMULATOR' || updated.checkType === 'UPGRADE_RECORD') {
        supersedeParams.push(updated.details?.variant || null);
        variantClause = `AND details->>'variant' = $${supersedeParams.length}`;
      }
      const { rows: supersededRows } = await client.query(
        `UPDATE checks SET archived = true, archived_at = now()
         WHERE check_type = $1 AND crew_member_id = $2 AND id != $3
           AND archived = false AND result IS NOT NULL ${variantClause}
         RETURNING id`,
        supersedeParams,
      );
      superseded = supersededRows;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const { rows } = await pool.query(updateSql, updateParams);
    updated = rowToCamel(rows[0]);
  }

  // Only the specific PATCH call that actually sets a result reads as a
  // "completed" event worth surfacing - the same check gets several other
  // incremental UPDATE calls while a form is being filled in, which would
  // otherwise flood the feed with duplicate-looking entries.
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'checks', targetId: existing.id,
    description: d.result
      ? `Completed ${CHECK_TYPE_LABELS[updated.checkType] || updated.checkType} for ${await checkSubjectName(updated)} — ${d.result}`
      : undefined,
  });

  if (updated.checkType === 'RECURRENT_SIMULATOR' && d.result && updated.assignedTo) {
    const seatCheck = Array.isArray(updated.details?.seatCheck) ? updated.details.seatCheck : [];
    if (seatCheck.includes('Other Seat')) {
      await revalidateRhsCompetency(updated.assignedTo, updated.completedAt);
    }
  }

  for (const row of superseded) {
    await logAction({ userId: req.user.id, action: 'ARCHIVE', targetTable: 'checks', targetId: row.id });
  }

  res.json(updated);
});

const licencePhotoSchema = z.object({ photo: z.string().nullable() });

// A photo of the IPC entry recorded on the candidate's physical licence -
// stored on the check itself (so it's part of that check's historical
// record) and also mirrored onto the crew member's profile as their
// current licence photo, which gets overwritten the next time an IPC is
// completed for them (see crew.js GET /:id for how it's read back).
router.patch('/:id/licence-photo', async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (!canAccessCheckType(req.user, existing.checkType)) return res.status(403).json({ error: 'Forbidden' });
  if (existing.checkType !== 'RECURRENT_SIMULATOR' || existing.details?.variant !== 'IPC_PC') {
    return res.status(400).json({ error: 'Licence photos can only be attached to an IPC' });
  }

  const parsed = licencePhotoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const details = { ...existing.details, licencePhoto: parsed.data.photo };
  const { rows } = await pool.query(
    'UPDATE checks SET details = $1 WHERE id = $2 RETURNING *',
    [JSON.stringify(details), req.params.id],
  );
  if (existing.crewMemberId) {
    await pool.query('UPDATE crew_members SET licence_photo = $1 WHERE id = $2', [parsed.data.photo, existing.crewMemberId]);
  }
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'checks', targetId: existing.id });
  res.json(rowToCamel(rows[0]));
});

// The Upgrade Record's Check tab uses the real Personnel (Air) Competency
// Check form (SA518) - Preflight/[role section]/Debrief items, one overall
// assessor signature - as its final assessment, instead of a separate
// flight log, per the operator's explicit request. This creates that
// linked record (candidate_section fixed from the upgrade variant's target
// role, not the candidate's current role, since they don't hold it yet)
// the first time the tab is opened, and is idempotent after that - opening
// the tab again just returns the same row via details.personnelCheckId
// rather than creating a duplicate.
router.post('/:id/personnel-check', async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const check = rowToCamel(existingRows[0]);
  if (check.checkType !== 'UPGRADE_RECORD') return res.status(400).json({ error: 'Not an Upgrade Record' });
  if (!canAccessCheckType(req.user, 'UPGRADE_RECORD')) return res.status(403).json({ error: 'Forbidden' });

  if (check.details?.personnelCheckId) {
    const { rows } = await pool.query('SELECT * FROM personnel_competency_checks WHERE id = $1', [check.details.personnelCheckId]);
    if (rows.length > 0) return res.json(rowToCamel(rows[0]));
  }

  const variantConfig = UPGRADE_VARIANTS[check.details?.variant];
  if (!variantConfig) return res.status(400).json({ error: 'Unknown upgrade variant' });

  const { rows: crewRows } = await pool.query('SELECT user_id FROM crew_members WHERE id = $1', [check.crewMemberId]);
  const candidateUserId = crewRows[0]?.user_id;
  if (!candidateUserId) {
    return res.status(400).json({ error: 'This candidate has no staff account yet - add them via the Staff tab (tick "This is an existing crew member") first.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO personnel_competency_checks (user_id, candidate_section)
     VALUES ($1, $2) RETURNING *`,
    [candidateUserId, PERSONNEL_AIR_COMPETENCY_SECTION[variantConfig.targetRole]],
  );
  const created = rowToCamel(rows[0]);

  await pool.query(`UPDATE checks SET details = details || $1::jsonb WHERE id = $2`, [
    JSON.stringify({ personnelCheckId: created.id }), req.params.id,
  ]);

  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'personnel_competency_checks', targetId: created.id,
    description: `Started Personnel (Air) Competency Check for ${variantConfig.label}`,
  });
  res.status(201).json(created);
});

// Once an Upgrade Record is completed and passed, this updates the
// candidate's staff role (Training Captain/Check Captain/Training or Check
// Cabin Attendant) and seeds their Personnel (Air) Competency Check date to
// 24 months from completion, per the operator's explicit request - the SA
// 518 currency in users.js's withPersonnelAirCompetency is always computed
// from the most recent completed personnel_competency_checks row, so
// inserting one backdated to the completion date is all "seeding" means.
// Requires the candidate already be linked to a staff account (crew_members
// .user_id) - creating a brand-new account needs an email/password only a
// human can supply, so that stays a manual step via the Staff tab's
// "existing crew member" flow rather than something this silently does.
router.post('/:id/apply-upgrade', async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM checks WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const check = rowToCamel(existingRows[0]);
  if (check.checkType !== 'UPGRADE_RECORD') return res.status(400).json({ error: 'Not an Upgrade Record' });
  if (!canAccessCheckType(req.user, 'UPGRADE_RECORD')) return res.status(403).json({ error: 'Forbidden' });
  if (check.result !== 'PASS' || !check.completedAt) {
    return res.status(400).json({ error: 'This Upgrade Record must be completed with a PASS result first' });
  }
  if (check.details?.staffRecordUpdatedAt) {
    return res.status(400).json({ error: 'The staff record has already been updated for this Upgrade Record' });
  }

  const variant = check.details?.variant;
  const variantConfig = UPGRADE_VARIANTS[variant];
  if (!variantConfig) return res.status(400).json({ error: 'Unknown upgrade variant' });

  const { rows: crewRows } = await pool.query('SELECT id, user_id FROM crew_members WHERE id = $1', [check.crewMemberId]);
  if (crewRows.length === 0) return res.status(400).json({ error: 'Candidate crew record not found' });
  const crewUserId = crewRows[0].user_id;
  if (!crewUserId) {
    return res.status(400).json({ error: 'This candidate has no staff account yet - add them via the Staff tab (tick "This is an existing crew member"), then apply this upgrade again.' });
  }

  const { rows: updatedUserRows } = await pool.query(
    'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, role',
    [variantConfig.targetRole, crewUserId],
  );
  if (updatedUserRows.length === 0) return res.status(400).json({ error: 'Linked staff account not found' });

  // Only seed a placeholder personnel_competency_checks row when the Check
  // tab's own SA518 assessment (POST /:id/personnel-check below) wasn't
  // used - a completed real one already exists there and shouldn't be
  // duplicated.
  if (!check.details?.personnelCheckId) {
    await pool.query(
      `INSERT INTO personnel_competency_checks (user_id, candidate_section, check_date, completed_at, comments)
       VALUES ($1, $2, $3, $3, $4)`,
      [
        crewUserId,
        PERSONNEL_AIR_COMPETENCY_SECTION[variantConfig.targetRole],
        check.completedAt,
        `Seeded from ${variantConfig.label} completion`,
      ],
    );
  }

  const { rows } = await pool.query(
    `UPDATE checks SET details = details || $1::jsonb WHERE id = $2 RETURNING *`,
    [JSON.stringify({ staffRecordUpdatedAt: new Date().toISOString() }), req.params.id],
  );
  await logAction({
    userId: req.user.id, action: 'APPLY_UPGRADE', targetTable: 'users', targetId: crewUserId,
    description: `Updated ${updatedUserRows[0].name}'s staff role to ${variantConfig.targetRole} (${variantConfig.label})`,
  });
  res.json(rowToCamel(rows[0]));
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
module.exports.createCheckRecord = createCheckRecord;
