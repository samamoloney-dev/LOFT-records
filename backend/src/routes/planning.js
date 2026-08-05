const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { listCrewWithCurrency } = require('./crew');
const { addMonths } = require('../lib/currency');

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
// roster's recurrency:
//
// - Each check's own currency is untouched from anywhere else in the app:
//   an IPC is due 12 months after the last one (CASR Part 61.880's recency
//   requirement). Shown exactly as computed by crew.js's withCurrency
//   (currency.ipc/proficiencyCheck) - the same object every other page in
//   the app (Currency Overview, the crew profile, the Home dashboard)
//   reads, so this report can never quietly disagree with the rest of the
//   app about whether an individual check is overdue.
// - The gap between the two IS a genuine second compliance requirement,
//   separate from either check's own 12-month recency: CASR 121.575(1)(b)
//   caps a Part 121 proficiency check's validity at 8 months from
//   completion (not 12 - the 12-month allowance in (iii) only applies once
//   a pilot already has a documented history of checks within the
//   preceding year). This operator's own check-form practice treats a
//   completed IPC as also satisfying that Part 121 proficiency check
//   requirement (per the operator - "an IPC will reset the PC currency"),
//   so the relevant 8-month clock for 121.575 purposes is the gap between
//   the last two of *either* check type - exactly what lastIpc/lastPc
//   track here. chainBreachDate is the date by which the later of the two
//   needed to happen to stay within that 8 months; chainBreach is whether
//   it didn't. This is intentionally a two-check model (last IPC vs last
//   PC only) - it doesn't attempt 121.575(1)(b)(iii)'s further 12-month
//   anti-gaming cap on a longer documented history of checks, which needs
//   more history than this report tracks.
// - Beyond compliance, spacing the two ~6 months apart (rather than
//   right up against the 8-month ceiling) is this operator's own safety
//   margin for forward planning, not itself a separate CASR figure.
router.get('/ipc-pc-spacing', async (req, res) => {
  const pilots = await listCrewWithCurrency({ type: 'PILOT' });

  const rows = pilots.map((m) => {
    const { lastIpc, lastPc } = m.ipcPcRaw || {};
    const spacingDays = (lastIpc && lastPc)
      ? Math.round(Math.abs(new Date(lastPc).getTime() - new Date(lastIpc).getTime()) / DAY_MS)
      : null;

    let chainBreach = false;
    let chainBreachDate = null;
    if (lastIpc && lastPc) {
      const ipcTime = new Date(lastIpc).getTime();
      const pcTime = new Date(lastPc).getTime();
      const earlierTime = Math.min(ipcTime, pcTime);
      const laterTime = Math.max(ipcTime, pcTime);
      chainBreachDate = addMonths(new Date(earlierTime), 8);
      chainBreach = laterTime > chainBreachDate.getTime();
    }

    return {
      crewMemberId: m.id,
      name: m.name,
      fleet: m.fleets[0] || null,
      role: m.role,
      spacingDays,
      chainBreach,
      chainBreachDate: chainBreachDate ? chainBreachDate.toISOString() : null,
      ipc: m.currency.ipc,
      pc: m.currency.proficiencyCheck,
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
