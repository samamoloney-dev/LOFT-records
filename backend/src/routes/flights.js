const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { canAccessTraineeRecord, canAccessArchived, canEditFlight, canAcknowledgeFlight, requireRole, FLIGHT_CREATOR_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

async function findTrainee(id) {
  const { rows } = await pool.query('SELECT * FROM trainees WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

async function findFlight(id) {
  const { rows } = await pool.query('SELECT * FROM flights WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

async function findFlightWithTrainer(id) {
  const { rows } = await pool.query(
    `SELECT f.*, tc.name AS training_captain_name
     FROM flights f
     LEFT JOIN users tc ON tc.id = f.training_captain_id
     WHERE f.id = $1`,
    [id],
  );
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
  const { traineeId } = req.query;
  if (!traineeId) return res.status(400).json({ error: 'traineeId is required' });

  const trainee = await assertTraineeVisible(req, res, traineeId);
  if (!trainee) return;

  const { rows } = await pool.query(
    `SELECT f.*, tc.name AS training_captain_name
     FROM flights f
     LEFT JOIN users tc ON tc.id = f.training_captain_id
     WHERE f.trainee_id = $1
     ORDER BY f.date DESC`,
    [traineeId],
  );
  res.json(rows.map(rowToCamel));
});

router.get('/:id', async (req, res) => {
  const flight = await findFlight(req.params.id);
  if (!flight) return res.status(404).json({ error: 'Not found' });
  const trainee = await assertTraineeVisible(req, res, flight.traineeId);
  if (!trainee) return;
  res.json(await findFlightWithTrainer(flight.id));
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
    `INSERT INTO flights (trainee_id, training_captain_id, date, sector_details, hours)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      parsed.data.traineeId,
      req.user.id,
      parsed.data.date,
      JSON.stringify(parsed.data.sectorDetails || {}),
      parsed.data.hours || 0,
    ],
  );
  const flight = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'flights', targetId: flight.id });
  res.status(201).json({ ...flight, trainingCaptainName: req.user.name });
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
  res.json(await findFlightWithTrainer(flight.id));
});

router.post('/:id/finalize', async (req, res) => {
  const flight = await findFlight(req.params.id);
  if (!flight) return res.status(404).json({ error: 'Not found' });
  if (!canEditFlight(req.user, flight)) return res.status(403).json({ error: 'Forbidden' });

  await pool.query('UPDATE flights SET locked = true WHERE id = $1', [flight.id]);
  await logAction({ userId: req.user.id, action: 'FINALIZE', targetTable: 'flights', targetId: flight.id });
  res.json(await findFlightWithTrainer(flight.id));
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
  res.json(await findFlightWithTrainer(flight.id));
});

module.exports = router;
