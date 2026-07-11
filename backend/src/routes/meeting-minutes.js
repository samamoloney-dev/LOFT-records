const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

const SECTION_FIELDS = {
  avsafeNumber: 'avsafe_number',
  meetingDate: 'meeting_date',
  attendanceRegister: 'attendance_register',
  apologies: 'apologies',
  acceptanceOfPreviousMinutes: 'acceptance_of_previous_minutes',
  personnel: 'personnel',
  currentWorkload: 'current_workload',
  checkingTrainingOutcomes: 'checking_training_outcomes',
  incidentsOccurrences: 'incidents_occurrences',
  flightStandardsManual: 'flight_standards_manual',
  administration: 'administration',
  nextMeeting: 'next_meeting',
};

const minutesSchema = z.object(
  Object.fromEntries(Object.keys(SECTION_FIELDS).map((key) => [key, z.string().nullable().optional()])),
);

async function findMinutes(id) {
  const { rows } = await pool.query('SELECT * FROM meeting_minutes WHERE id = $1', [id]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

// Every staff account is expected to acknowledge - trainees have their own
// self-login accounts (see canAcknowledgeFlight elsewhere) but aren't part
// of this operational-meeting audience.
async function eligibleStaffCount() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE role != 'TRAINEE'`);
  return rows[0].n;
}

// The one PUBLISHED record (there's only ever one - see the partial unique
// index) plus whether the logged-in user has acknowledged it yet. Powers
// both the "minutes published" login alert and the read view every
// non-trainee staff member lands on - drafts stay invisible here.
router.get('/current', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM meeting_minutes WHERE status = 'PUBLISHED' LIMIT 1`);
  if (rows.length === 0) return res.json(null);
  const minutes = rowToCamel(rows[0]);
  const { rows: ackRows } = await pool.query(
    'SELECT 1 FROM meeting_minutes_acknowledgements WHERE meeting_minutes_id = $1 AND user_id = $2',
    [minutes.id, req.user.id],
  );
  res.json({ ...minutes, acknowledgedByMe: ackRows.length > 0 });
});

// Full history (every status) - management view, HOTC/HOFO/Flight Ops
// Admin/Alternate only, same as every other admin listing in this app.
router.get('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM meeting_minutes ORDER BY created_at DESC');
  res.json(rows.map(rowToCamel));
});

router.get('/:id', async (req, res) => {
  const minutes = await findMinutes(req.params.id);
  if (!minutes) return res.status(404).json({ error: 'Not found' });
  // A draft is a work in progress - only admins get to see it before it's
  // published, same as everywhere else drafts are hidden until they're the
  // real thing (e.g. checks aren't visible until assigned/created).
  if (minutes.status === 'DRAFT' && !ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { rows: ackRows } = await pool.query(
    'SELECT 1 FROM meeting_minutes_acknowledgements WHERE meeting_minutes_id = $1 AND user_id = $2',
    [minutes.id, req.user.id],
  );
  res.json({ ...minutes, acknowledgedByMe: ackRows.length > 0 });
});

router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = minutesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // meetingDate is a real DATE column - an empty string (the frontend's
  // "not set yet" default for every field) isn't valid input for it, so it
  // needs the same null-coercion every other date field in this app gets.
  const columns = Object.keys(SECTION_FIELDS).map((key) => SECTION_FIELDS[key]);
  const values = Object.keys(SECTION_FIELDS).map((key) => {
    const v = parsed.data[key] ?? null;
    return key === 'meetingDate' ? (v || null) : v;
  });

  const { rows } = await pool.query(
    `INSERT INTO meeting_minutes (${columns.join(', ')}, created_by)
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}, $${columns.length + 1})
     RETURNING *`,
    [...values, req.user.id],
  );
  const minutes = rowToCamel(rows[0]);
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'meeting_minutes', targetId: minutes.id });
  res.status(201).json(minutes);
});

router.patch('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  const minutes = await findMinutes(req.params.id);
  if (!minutes) return res.status(404).json({ error: 'Not found' });
  // Once published, the record is what staff acknowledged - it doesn't get
  // silently rewritten afterwards. Draft it again (create a new one) if a
  // correction is needed post-publish.
  if (minutes.status !== 'DRAFT') return res.status(403).json({ error: 'Only a draft can be edited' });

  const parsed = minutesSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.json(minutes);

  const setClauses = entries.map(([key], i) => `${SECTION_FIELDS[key]} = $${i + 1}`);
  const values = entries.map(([key, value]) => (key === 'meetingDate' ? (value || null) : value));
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE meeting_minutes SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'meeting_minutes', targetId: req.params.id });
  res.json(rowToCamel(rows[0]));
});

router.delete('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  const minutes = await findMinutes(req.params.id);
  if (!minutes) return res.status(404).json({ error: 'Not found' });
  if (minutes.status !== 'DRAFT') return res.status(403).json({ error: 'Only a draft can be deleted - a published record is retained' });

  await pool.query('DELETE FROM meeting_minutes WHERE id = $1', [req.params.id]);
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'meeting_minutes', targetId: req.params.id });
  res.status(204).send();
});

// Publishing makes this the one current record - whatever was previously
// PUBLISHED (there's at most one, per the partial unique index) is archived
// in the same transaction, never just left dangling as a second "current"
// copy.
router.post('/:id/publish', requireRole(...ADMIN_ROLES), async (req, res) => {
  const minutes = await findMinutes(req.params.id);
  if (!minutes) return res.status(404).json({ error: 'Not found' });
  if (minutes.status === 'PUBLISHED') return res.status(400).json({ error: 'Already published' });

  const client = await pool.connect();
  let published;
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE meeting_minutes SET status = 'ARCHIVED' WHERE status = 'PUBLISHED'`);
    const { rows } = await client.query(
      `UPDATE meeting_minutes SET status = 'PUBLISHED', published_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id],
    );
    published = rowToCamel(rows[0]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await logAction({
    userId: req.user.id, action: 'PUBLISH', targetTable: 'meeting_minutes', targetId: published.id,
    description: `Published Flight Standards meeting minutes${published.avsafeNumber ? ` (Avsafe ${published.avsafeNumber})` : ''}`,
  });
  res.json(published);
});

// Any non-trainee staff member acknowledges having read the current (or a
// past) set of minutes - idempotent, so clicking twice or a stale page
// re-submitting doesn't error.
router.post('/:id/acknowledge', async (req, res) => {
  const minutes = await findMinutes(req.params.id);
  if (!minutes) return res.status(404).json({ error: 'Not found' });
  if (minutes.status === 'DRAFT') return res.status(403).json({ error: 'This has not been published yet' });
  if (req.user.role === 'TRAINEE') return res.status(403).json({ error: 'Forbidden' });

  await pool.query(
    `INSERT INTO meeting_minutes_acknowledgements (meeting_minutes_id, user_id)
     VALUES ($1, $2) ON CONFLICT (meeting_minutes_id, user_id) DO NOTHING`,
    [minutes.id, req.user.id],
  );
  res.json({ acknowledgedByMe: true });
});

// Who has/hasn't acknowledged yet - admin-only visibility into completion,
// same audience as everything else gated to ADMIN_ROLES here.
router.get('/:id/acknowledgements', requireRole(...ADMIN_ROLES), async (req, res) => {
  const minutes = await findMinutes(req.params.id);
  if (!minutes) return res.status(404).json({ error: 'Not found' });

  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.name, u.role, a.acknowledged_at
     FROM meeting_minutes_acknowledgements a
     JOIN users u ON u.id = a.user_id
     WHERE a.meeting_minutes_id = $1
     ORDER BY a.acknowledged_at ASC`,
    [minutes.id],
  );
  res.json({
    acknowledgedBy: rows.map(rowToCamel),
    acknowledgedCount: rows.length,
    eligibleCount: await eligibleStaffCount(),
  });
});

module.exports = router;
