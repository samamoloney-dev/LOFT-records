const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, canAccessArchived, canEditFlight, canAcknowledgeFlight, requireRole, FLIGHT_CREATOR_ROLES, isAdmin } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

async function findTrainee(id) {
  const { rows } = await pool.query('SELECT * FROM trainees WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

// training_captain_name is snapshotted directly on the row at creation time
// (see POST /), so no join to users is needed to display it - and it
// survives the training captain's account later being deleted.
async function findFlight(id) {
  const { rows } = await pool.query('SELECT * FROM flights WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

async function assertTraineeVisible(req, res, traineeId) {
  const trainee = await findTrainee(traineeId);
  if (!trainee) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  if (!canAccessTraineeRecord(req.user, trainee)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  if (trainee.archived && !canAccessArchived(req.user)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return trainee;
}

router.get('/', async (req, res) => {
  const { traineeId, archived } = req.query;

  if (!traineeId) {
    // No trainee given - this is the cross-trainee Archive view, not the
    // per-trainee flights list. Only admins can browse archived flights
    // globally, and only archived ones (never the live list) this way.
    if (archived !== 'true' || !isAdmin(req.user)) {
      return res.status(400).json({ error: 'traineeId is required' });
    }
    const { rows } = await pool.query(
      `SELECT f.*, t.first_name, t.last_name, t.type AS trainee_type
       FROM flights f
       JOIN trainees t ON t.id = f.trainee_id
       WHERE f.archived = true
       ORDER BY f.archived_at DESC`,
    );
    return res.json(rows.map(rowToCamel));
  }

  const trainee = await assertTraineeVisible(req, res, traineeId);
  if (!trainee) return;

  const { rows } = await pool.query(
    `SELECT * FROM flights WHERE trainee_id = $1 AND archived = $2 ORDER BY date DESC`,
    [traineeId, archived === 'true'],
  );
  res.json(rows.map(rowToCamel));
});

router.get('/:id', async (req, res) => {
  const flight = await findFlight(req.params.id);
  if (!flight) return res.status(404).json({ error: 'Not found' });
  const trainee = await assertTraineeVisible(req, res, flight.traineeId);
  if (!trainee) return;
  res.json(flight);
});

const createSchema = z.object({
  traineeId: z.string().uuid(),
  date: z.string(),
  sectorDetails: z.record(z.any()).optional(),
  hours: z.number().nonnegative().optional(),
});

router.post('/', requireRole(...FLIGHT_CREATOR_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const trainee = await assertTraineeVisible(req, res, parsed.data.traineeId);
  if (!trainee) return;

  const { rows } = await pool.query(
    `INSERT INTO flights (trainee_id, training_captain_id, training_captain_name, training_captain_role, date, sector_details, hours)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      parsed.data.traineeId,
      req.user.id,
      req.user.name,
      req.user.role,
      parsed.data.date,
      JSON.stringify(parsed.data.sectorDetails || {}),
      parsed.data.hours || 0,
    ],
  );
  const flight = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'flights', targetId: flight.id });
  res.status(201).json(flight);
});

// Partial update only - this is deliberate. Earlier versions of this form
// overwrote the whole record on every save, which wiped the debrief when a
// trainee just ticked "acknowledged" or a TC only changed the rating.
const updateSchema = z.object({
  sectorDetails: z.record(z.any()).optional(),
  loftPerformanceRating: z.string().nullable().optional(),
  debriefComments: z.string().nullable().optional(),
  nextSortieNotes: z.string().nullable().optional(),
  otherCompletedTasks: z.string().nullable().optional(),
  hours: z.number().nonnegative().optional(),
  date: z.string().optional(),
  assessorSignature: z.string().nullable().optional(),
  candidateSignature: z.string().nullable().optional(),
});

const UPDATE_COLUMN_MAP = {
  sectorDetails: { column: 'sector_details', json: true },
  loftPerformanceRating: { column: 'loft_performance_rating' },
  debriefComments: { column: 'debrief_comments' },
  nextSortieNotes: { column: 'next_sortie_notes' },
  otherCompletedTasks: { column: 'other_completed_tasks' },
  hours: { column: 'hours' },
  date: { column: 'date' },
  assessorSignature: { column: 'assessor_signature' },
  candidateSignature: { column: 'candidate_signature' },
};

router.patch('/:id', async (req, res) => {
  const flight = await findFlight(req.params.id);
  if (!flight) return res.status(404).json({ error: 'Not found' });
  if (!canEditFlight(req.user, flight)) return res.status(403).json({ error: 'Forbidden' });
  if (flight.locked) return res.status(409).json({ error: 'Flight is locked and cannot be edited' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.json(flight);

  const setClauses = entries.map(([key], i) => `${UPDATE_COLUMN_MAP[key].column} = $${i + 1}`);
  const values = entries.map(([key, value]) => (UPDATE_COLUMN_MAP[key].json ? JSON.stringify(value) : value));
  values.push(req.params.id);

  await pool.query(
    `UPDATE flights SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
    values,
  );
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'flights', targetId: flight.id });
  res.json(await findFlight(flight.id));
});

router.post('/:id/finalize', async (req, res) => {
  const flight = await findFlight(req.params.id);
  if (!flight) return res.status(404).json({ error: 'Not found' });
  if (!canEditFlight(req.user, flight)) return res.status(403).json({ error: 'Forbidden' });

  await pool.query('UPDATE flights SET locked = true WHERE id = $1', [flight.id]);
  await logAction({ userId: req.user.id, action: 'FINALIZE', targetTable: 'flights', targetId: flight.id });
  res.json(await findFlight(flight.id));
});

router.post('/:id/acknowledge', async (req, res) => {
  const flight = await findFlight(req.params.id);
  if (!flight) return res.status(404).json({ error: 'Not found' });
  if (!canAcknowledgeFlight(req.user, flight)) return res.status(403).json({ error: 'Forbidden' });
  if (!flight.locked) return res.status(409).json({ error: 'Flight has not been finalised yet' });

  await pool.query(
    'UPDATE flights SET acknowledged_by_trainee = true, acknowledged_at = now() WHERE id = $1',
    [flight.id],
  );
  await logAction({ userId: req.user.id, action: 'ACKNOWLEDGE', targetTable: 'flights', targetId: flight.id });
  res.json(await findFlight(flight.id));
});

// LOFT flights archive as one package per trainee, not individually - and
// only once their Check to Line is complete (mirrors how their whole
// training record comes together on their own trainee page).
router.post('/trainee/:traineeId/archive-package', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can archive a LOFT package' });

  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  const { rows: ctlRows } = await pool.query('SELECT completed_at FROM check_to_line_forms WHERE trainee_id = $1', [trainee.id]);
  if (ctlRows.length === 0 || !ctlRows[0].completed_at) {
    return res.status(400).json({ error: 'Check to Line must be completed before this LOFT package can be archived' });
  }

  await pool.query(
    `UPDATE flights SET archived = true, archived_at = now() WHERE trainee_id = $1 AND locked = true AND archived = false`,
    [trainee.id],
  );
  await logAction({ userId: req.user.id, action: 'ARCHIVE_PACKAGE', targetTable: 'flights', targetId: trainee.id });

  const { rows } = await pool.query('SELECT * FROM flights WHERE trainee_id = $1 ORDER BY date DESC', [trainee.id]);
  res.json(rows.map(rowToCamel));
});

router.post('/trainee/:traineeId/unarchive-package', async (req, res) => {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Only HOTC, HOFO and Flight Ops Admin can unarchive a LOFT package' });

  const trainee = await assertTraineeVisible(req, res, req.params.traineeId);
  if (!trainee) return;

  await pool.query('UPDATE flights SET archived = false, archived_at = null WHERE trainee_id = $1', [trainee.id]);
  await logAction({ userId: req.user.id, action: 'UNARCHIVE_PACKAGE', targetTable: 'flights', targetId: trainee.id });

  const { rows } = await pool.query('SELECT * FROM flights WHERE trainee_id = $1 ORDER BY date DESC', [trainee.id]);
  res.json(rows.map(rowToCamel));
});

module.exports = router;
