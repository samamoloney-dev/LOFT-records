const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, canAccessArchived, isCaOnlyRole, isAdmin, ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { fleetOrderError } = require('../lib/fleetOrder');
const { PILOT_CLEARANCE_STAGES, CA_CLEARANCE_STAGES, isClearanceSigner } = require('../lib/clearance');

const router = express.Router();

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  type: z.enum(['PILOT', 'CABIN_ATTENDANT']),
  role: z.enum(['CAPTAIN', 'FIRST_OFFICER', 'CABIN_ATTENDANT']),
  fleet: z.enum(['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100']),
  phase: z.number().int().min(1).optional(),
  // Set when this trainee record represents an existing, already-qualified
  // crew member sent back into LOFT for a new fleet (e.g. Dash 8 -> Fokker
  // 100), rather than a brand-new hire - see /:id/promote-to-crew below,
  // which merges the new fleet into that crew member's record on
  // completion instead of creating a duplicate one.
  sourceCrewMemberId: z.string().uuid().optional(),
  // Which named syllabus (see syllabi.js) this trainee's Ground School/
  // LOFT Package come from - null/omitted means the fleet's standard one.
  // Fixed at creation, same as fleet.
  syllabusId: z.string().uuid().nullable().optional(),
});

async function withHours(trainee) {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(hours), 0) AS total_hours FROM flights WHERE trainee_id = $1',
    [trainee.id],
  );
  return { ...trainee, totalHours: Number(rows[0].total_hours) };
}

async function findTrainee(id) {
  const { rows } = await pool.query('SELECT * FROM trainees WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  const includeArchived = req.query.archived === 'true';
  if (includeArchived && !canAccessArchived(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const conditions = ['archived = $1'];
  const params = [includeArchived];
  if (isCaOnlyRole(req.user)) {
    conditions.push(`type = $${params.length + 1}`);
    params.push('CABIN_ATTENDANT');
  }

  const { rows } = await pool.query(
    `SELECT * FROM trainees WHERE ${conditions.join(' AND ')} ORDER BY last_name ASC`,
    params,
  );
  const trainees = rows.map(rowToCamel);
  const withTotals = await Promise.all(trainees.map(withHours));
  res.json(withTotals);
});

router.get('/:id', async (req, res) => {
  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });
  if (trainee.archived && !canAccessArchived(req.user)) return res.status(403).json({ error: 'Forbidden' });

  res.json(await withHours(trainee));
});

// Only HOTC, HOFO, Flight Ops Admin and Alternate can add a new trainee -
// no other staff role, per the operator's explicit rule.
router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { firstName, lastName, type, role, fleet, phase, sourceCrewMemberId, syllabusId } = parsed.data;

  if (sourceCrewMemberId) {
    const { rows: crewRows } = await pool.query('SELECT type, archived FROM crew_members WHERE id = $1', [sourceCrewMemberId]);
    if (crewRows.length === 0) return res.status(400).json({ error: 'Crew member not found' });
    if (crewRows[0].archived) return res.status(400).json({ error: 'This crew member is archived' });
    if (crewRows[0].type !== type) return res.status(400).json({ error: 'Crew member type does not match the selected trainee type' });
  }

  const { rows } = await pool.query(
    `INSERT INTO trainees (first_name, last_name, type, role, fleet, phase, source_crew_member_id, syllabus_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [firstName, lastName, type, role, fleet, phase || 1, sourceCrewMemberId || null, syllabusId || null],
  );
  const trainee = rowToCamel(rows[0]);
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'trainees', targetId: trainee.id,
    description: sourceCrewMemberId
      ? `Sent ${trainee.firstName} ${trainee.lastName} back to LOFT for ${fleet}`
      : `Added trainee ${trainee.firstName} ${trainee.lastName}`,
  });
  res.status(201).json(await withHours(trainee));
});

const COLUMN_MAP = {
  firstName: 'first_name',
  lastName: 'last_name',
  type: 'type',
  role: 'role',
  fleet: 'fleet',
};

// `phase` is deliberately not patchable here - the only legitimate way a
// trainee's phase advances is by signing off every required item and
// completing the phase via POST /trainee/:traineeId/phase-completions/:phase/complete
// (syllabus.js), which enforces ground school + all required phase items
// first. Allowing it through this generic update would let anyone bypass
// that gate entirely - exactly the "phase 2 incomplete but advanced to
// phase 3" bug the operator flagged.
const updateSchema = createSchema.omit({ phase: true }).partial();

router.patch('/:id', async (req, res) => {
  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.json(await withHours(trainee));

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE trainees SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'trainees', targetId: trainee.id });
  res.json(await withHours(rowToCamel(rows[0])));
});

// Once a trainee's Check to Line is complete, they can move onto the Crew
// roster (the ongoing recurrency-tracking system) without re-typing their
// name/fleet/role. For pilots, the CTL completion date becomes their fixed
// Line Check anniversary going forward.
router.post('/:id/promote-to-crew', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can add crew' });

  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const { rows: ctlRows } = await pool.query('SELECT completed_at FROM check_to_line_forms WHERE trainee_id = $1', [trainee.id]);
  if (ctlRows.length === 0 || !ctlRows[0].completed_at) {
    return res.status(400).json({ error: 'Check to Line must be completed before adding this trainee to the Crew roster' });
  }

  // A trainee sent back to LOFT for a new fleet (source_crew_member_id set -
  // see POST / above) already has a crew record - merge the new fleet into
  // it instead of creating a duplicate. Falls through to the normal
  // brand-new-hire path below if that record has since gone missing.
  let sourceCrew = null;
  if (trainee.sourceCrewMemberId) {
    const { rows: sourceRows } = await pool.query('SELECT * FROM crew_members WHERE id = $1', [trainee.sourceCrewMemberId]);
    if (sourceRows.length > 0) sourceCrew = rowToCamel(sourceRows[0]);
  }

  const client = await pool.connect();
  let crewMember;
  try {
    await client.query('BEGIN');
    let rows;
    if (sourceCrew) {
      const mergedFleets = [...new Set([...parsePgArray(sourceCrew.fleets), trainee.fleet])];
      const fleetError = fleetOrderError(sourceCrew.type, mergedFleets);
      if (fleetError) throw Object.assign(new Error(fleetError), { status: 400 });
      ({ rows } = await client.query(
        'UPDATE crew_members SET fleets = $1::fleet[] WHERE id = $2 RETURNING *',
        [mergedFleets, sourceCrew.id],
      ));
    } else {
      ({ rows } = await client.query(
        `INSERT INTO crew_members (first_name, last_name, type, role, fleets, line_check_anchor_date)
         VALUES ($1, $2, $3, $4, $5::fleet[], $6) RETURNING *`,
        [
          trainee.firstName,
          trainee.lastName,
          trainee.type,
          trainee.role,
          [trainee.fleet],
          trainee.type === 'PILOT' ? ctlRows[0].completed_at : null,
        ],
      ));
    }
    // The trainee record becomes redundant once they're on the Crew roster -
    // archive it now rather than at Check to Line completion time, so the
    // trainee stays visible/active right up until this point.
    await client.query('UPDATE trainees SET archived = true, archived_at = now() WHERE id = $1', [trainee.id]);
    // Any clearance stages signed while they were still a trainee (ground
    // school/aircraft conversion, check to line) move over to the new crew
    // record too, so its Clearance tab shows the full history rather than
    // starting blank.
    await client.query(
      'UPDATE crew_clearances SET crew_member_id = $1, trainee_id = NULL WHERE trainee_id = $2',
      [rows[0].id, trainee.id],
    );
    await client.query('COMMIT');
    crewMember = { ...rowToCamel(rows[0]), fleets: parsePgArray(rows[0].fleets) };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status === 400) return res.status(400).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }
  await logAction({
    userId: req.user.id, action: 'PROMOTE_TO_CREW', targetTable: 'crew_members', targetId: crewMember.id,
    description: sourceCrew
      ? `Added ${trainee.fleet} to ${crewMember.firstName} ${crewMember.lastName}'s crew record`
      : `Promoted ${crewMember.firstName} ${crewMember.lastName} to the Crew roster`,
  });
  res.status(sourceCrew ? 200 : 201).json(crewMember);
});

// A trainee who withdraws or otherwise stops training needs a way out of
// the active list that isn't tied to Check to Line completion (the only
// other path to archived - see promote-to-crew above) - mirrors crew_members'
// own archive/unarchive pair.
router.post('/:id/archive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can archive trainees' });
  const { rows } = await pool.query(
    'UPDATE trainees SET archived = true, archived_at = now() WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'ARCHIVE', targetTable: 'trainees', targetId: req.params.id,
    description: `Archived trainee ${rows[0].first_name} ${rows[0].last_name}`,
  });
  res.json(await withHours(rowToCamel(rows[0])));
});

router.post('/:id/unarchive', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can unarchive trainees' });
  const { rows } = await pool.query(
    'UPDATE trainees SET archived = false, archived_at = null WHERE id = $1 RETURNING *',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UNARCHIVE', targetTable: 'trainees', targetId: req.params.id });
  res.json(await withHours(rowToCamel(rows[0])));
});

// Explicit HOTC/HOFO/Flight Ops Admin-only "Ground School Complete"
// confirmation for cabin attendant trainees - the pilot-side equivalent
// (Aircraft Endorsement) lives as a Ground School tab item instead (see
// migration 0086), since pilots already have that tab and cabin attendants
// don't. Ticking this is what actually triggers a CA's first Clearance
// Form alert (see dashboard.js's clearanceAlerts). Deliberately narrower
// than the general ADMIN_ROLES gate (which also includes Alternate) -
// Alternate is already barred from signing the Clearance Form itself (see
// isClearanceSigner below), so it's excluded from confirming the milestone
// that feeds into it too.
const READY_FOR_LOFT_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];
router.post('/:id/ready-for-loft', async (req, res) => {
  if (!READY_FOR_LOFT_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can confirm this' });
  }
  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (trainee.type !== 'CABIN_ATTENDANT') {
    return res.status(400).json({ error: 'Pilot trainees track this on the Ground School tab (Aircraft Endorsement) instead' });
  }
  if (trainee.archived) return res.status(403).json({ error: 'This trainee is archived - unarchive them first to make changes' });
  if (trainee.readyForLoftAt) return res.status(400).json({ error: 'Already confirmed' });

  const { rows } = await pool.query(
    `UPDATE trainees SET ready_for_loft_at = now(), ready_for_loft_by_name = $1 WHERE id = $2 RETURNING *`,
    [req.user.name, req.params.id],
  );
  const updated = rowToCamel(rows[0]);
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'trainees', targetId: updated.id,
    description: `Confirmed Ground School complete for ${updated.firstName} ${updated.lastName}`,
  });
  res.json(await withHours(updated));
});

// Clearance Form (SA 586 pilots / SA 539 cabin attendants) - a trainee
// reaches the first stage or two of this (aircraft conversion/ground
// school, then check to line) before they're even a crew member, so
// entries attach to the trainee directly rather than waiting for the
// separate "promote to crew" step. See crew.js's own /:id/clearances for
// the crew-side equivalent, and promote-to-crew above for how ownership
// transfers once a crew_members row exists.
router.get('/:id/clearances', async (req, res) => {
  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (!canAccessTraineeRecord(req.user, trainee)) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await pool.query(
    'SELECT * FROM crew_clearances WHERE trainee_id = $1 ORDER BY created_at ASC',
    [trainee.id],
  );
  res.json(rows.map(rowToCamel));
});

const clearanceSchema = z.object({
  stage: z.enum([...new Set([...PILOT_CLEARANCE_STAGES, ...CA_CLEARANCE_STAGES])]),
  details: z.record(z.any()).optional(),
  // Lets an already-completed real-world sign-off be backdated when this
  // trainee's history is first entered into the system, instead of every
  // entry reading as signed "today" - optional, defaults to now().
  signedAt: z.string().optional(),
});

router.post('/:id/clearances', async (req, res) => {
  if (!isClearanceSigner(req.user)) return res.status(403).json({ error: 'Only HOTC and HOFO can sign the clearance form' });
  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (trainee.archived) return res.status(403).json({ error: 'This trainee is archived - unarchive them first to make changes' });

  const parsed = clearanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const allowedStages = trainee.type === 'PILOT' ? PILOT_CLEARANCE_STAGES : CA_CLEARANCE_STAGES;
  if (!allowedStages.includes(parsed.data.stage)) return res.status(400).json({ error: 'Invalid stage for this trainee type' });
  const signedAt = parsed.data.signedAt ? new Date(parsed.data.signedAt) : new Date();
  if (Number.isNaN(signedAt.getTime()) || signedAt > new Date()) {
    return res.status(400).json({ error: 'Signed date cannot be in the future' });
  }

  const { rows } = await pool.query(
    `INSERT INTO crew_clearances (trainee_id, stage, details, signed_by_name, signed_by_user_id, signed_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [trainee.id, parsed.data.stage, JSON.stringify(parsed.data.details || {}), req.user.name, req.user.id, signedAt],
  );
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'crew_clearances', targetId: rows[0].id });
  res.status(201).json(rowToCamel(rows[0]));
});

router.delete('/:id/clearances/:clearanceId', async (req, res) => {
  if (!isClearanceSigner(req.user)) return res.status(403).json({ error: 'Only HOTC and HOFO can sign the clearance form' });
  const trainee = await findTrainee(req.params.id);
  if (!trainee) return res.status(404).json({ error: 'Not found' });
  if (trainee.archived) return res.status(403).json({ error: 'This trainee is archived - unarchive them first to make changes' });
  const { rows } = await pool.query(
    'DELETE FROM crew_clearances WHERE id = $1 AND trainee_id = $2 RETURNING id',
    [req.params.clearanceId, req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'crew_clearances', targetId: req.params.clearanceId });
  res.status(204).send();
});

module.exports = router;
