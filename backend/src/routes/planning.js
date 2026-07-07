const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

const CHECK_LABELS = {
  emergencyProcedures: 'Emergency Procedures',
  ipc: 'IPC',
  proficiencyCheck: 'Proficiency Check',
  lineCheck: 'Line Check',
};

// Aggregated planning view across the whole roster - the per-crew-member
// planned date editors already exist on each Crew profile (see crew.js),
// this just surfaces all of them (plus any assigned examiner/instructor/
// check pilot) in one place so HOTC/HOFO/Flight Ops Admin don't have to
// click through every profile to see what's coming up.
router.get('/planned-checks', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pc.*, cm.first_name, cm.last_name, cm.fleets, cm.type
     FROM crew_planned_checks pc
     JOIN crew_members cm ON cm.id = pc.crew_member_id
     WHERE cm.archived = false
     ORDER BY pc.planned_date ASC`,
  );
  res.json(rows.map((row) => {
    const r = rowToCamel(row);
    return {
      ...r,
      fleets: parsePgArray(r.fleets),
      crewMemberName: `${r.firstName} ${r.lastName}`,
      label: CHECK_LABELS[r.checkKey] || r.checkKey,
    };
  }));
});

router.get('/planned-competencies', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cc.crew_member_id, cc.planned_date, COALESCE(cc.course_sent, false) AS course_sent, ct.name, cm.first_name, cm.last_name, cm.fleets
     FROM crew_competencies cc
     JOIN competency_types ct ON ct.id = cc.competency_type_id
     JOIN crew_members cm ON cm.id = cc.crew_member_id
     WHERE cc.planned_date IS NOT NULL AND cm.archived = false
     ORDER BY cc.planned_date ASC`,
  );
  res.json(rows.map((row) => {
    const r = rowToCamel(row);
    return { ...r, fleets: parsePgArray(r.fleets), crewMemberName: `${r.firstName} ${r.lastName}` };
  }));
});

// Freeform planning items not tied to a specific recurrent check type or
// crew member - e.g. "book Dash 8 sim slot for October".
router.get('/notes', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM planning_notes ORDER BY planned_date ASC NULLS LAST, created_at DESC');
  res.json(rows.map(rowToCamel));
});

const noteSchema = z.object({
  title: z.string().min(1),
  notes: z.string().nullable().optional(),
  plannedDate: z.string().nullable().optional(),
});

router.post('/notes', async (req, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const { rows } = await pool.query(
    'INSERT INTO planning_notes (title, notes, planned_date, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
    [d.title, d.notes || null, d.plannedDate || null, req.user.id],
  );
  await logAction({ userId: req.user.id, action: 'CREATE', targetTable: 'planning_notes', targetId: rows[0].id });
  res.status(201).json(rowToCamel(rows[0]));
});

const noteUpdateSchema = noteSchema.partial();
const NOTE_COLUMN_MAP = { title: 'title', notes: 'notes', plannedDate: 'planned_date' };

router.patch('/notes/:id', async (req, res) => {
  const parsed = noteUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${NOTE_COLUMN_MAP[key]} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE planning_notes SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'planning_notes', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

router.delete('/notes/:id', async (req, res) => {
  const { rows } = await pool.query('DELETE FROM planning_notes WHERE id = $1 RETURNING id', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'planning_notes', targetId: req.params.id });
  res.status(204).send();
});

module.exports = router;
