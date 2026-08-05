const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { listCrewWithCurrency } = require('./crew');

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
     WHERE cm.archived = false AND pc.planned_date IS NOT NULL
     ORDER BY pc.planned_date ASC`,
  );
  res.json(rows.map((row) => {
    const r = rowToCamel(row);
    return {
      ...r,
      // pg returns DATE columns as JS Date objects, which would otherwise
      // serialize to a full ISO timestamp - plain YYYY-MM-DD is what the
      // <input type="date"> on the Planning tab (and anything re-sending
      // this value, like picking an examiner) actually needs.
      plannedDate: r.plannedDate ? new Date(r.plannedDate).toISOString().slice(0, 10) : null,
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
       AND (ct.applies_to IS NULL OR ct.applies_to = cm.type)
       AND (ct.staff_roles IS NULL OR EXISTS (
         SELECT 1 FROM users u WHERE u.id = cm.user_id AND u.role = ANY(ct.staff_roles)
       ))
     ORDER BY cc.planned_date ASC`,
  );
  res.json(rows.map((row) => {
    const r = rowToCamel(row);
    return { ...r, fleets: parsePgArray(r.fleets), crewMemberName: `${r.firstName} ${r.lastName}` };
  }));
});

// Fleet-then-rank grouping, matching Crew.jsx's own "Fleet & Rank" sort
// mode - pilots only (this report has no cabin attendant equivalent), so
// the cabin fleets that list also carries aren't needed here.
const SPACING_FLEET_ORDER = ['FOKKER_100', 'DASH_8', 'METRO_23'];
const SPACING_RANK_ORDER = { CAPTAIN: 0, FIRST_OFFICER: 1 };
const DAY_MS = 24 * 60 * 60 * 1000;

// IPC/PC Spacing (Planning tab) - a forward-planning view of the pilot
// roster's recurrency, deliberately kept to what's actually load-bearing:
//
// - Compliance itself is untouched from anywhere else in the app: an IPC
//   is due 12 months after the last one (CASR Part 61.880's recency
//   requirement), and a Proficiency Check is due 12 months after the last
//   one under the operator's own CASR Part 121 training-and-checking
//   system approval. Both are already computed exactly this way by
//   crew.js's withCurrency (currency.ipc/proficiencyCheck) and shown
//   identically everywhere else in the app (Currency Overview, the crew
//   profile, the Home dashboard) - this route just reuses those objects
//   wholesale rather than recomputing due-date/status logic a second time,
//   so this report can never quietly disagree with the rest of the app
//   about whether someone is actually overdue.
// - Spacing the two checks ~6 months apart is the operator's own
//   scheduling preference (so a pilot is seen roughly twice a year rather
//   than once each), not a CASR requirement - there's no regulatory
//   minimum or maximum gap between an IPC and a PC. spacingDays is
//   reported purely as a forward-planning aid, not a compliance signal.
router.get('/ipc-pc-spacing', async (req, res) => {
  const pilots = await listCrewWithCurrency({ type: 'PILOT' });

  const rows = pilots.map((m) => {
    const { lastIpc, lastPc } = m.ipcPcRaw || {};
    const spacingDays = (lastIpc && lastPc)
      ? Math.round(Math.abs(new Date(lastPc).getTime() - new Date(lastIpc).getTime()) / DAY_MS)
      : null;

    return {
      crewMemberId: m.id,
      name: m.name,
      fleet: m.fleets[0] || null,
      role: m.role,
      ipc: m.currency.ipc,
      pc: m.currency.proficiencyCheck,
      spacingDays,
      note: m.pcIpcOverrideComment || null,
    };
  });

  rows.sort((a, b) => {
    const fleetDiff = SPACING_FLEET_ORDER.indexOf(a.fleet) - SPACING_FLEET_ORDER.indexOf(b.fleet);
    if (fleetDiff !== 0) return fleetDiff;
    const rankDiff = (SPACING_RANK_ORDER[a.role] ?? 99) - (SPACING_RANK_ORDER[b.role] ?? 99);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name);
  });

  res.json(rows);
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
