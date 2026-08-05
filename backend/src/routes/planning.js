const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { ADMIN_ROLES, requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { listCrewWithCurrency } = require('./crew');
const { ipcPcSpacingStatus, addDays } = require('../lib/currency');

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

function daysUntil(date) {
  if (!date) return null;
  return Math.round((new Date(date).getTime() - Date.now()) / DAY_MS);
}

function earlierOf(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

// Replicates the operator's own "All Pilots IPC/PC dates, expiry and
// expected" spreadsheet (IPC-PC tab only - the Rules/SIM-CALC/Plan Rules
// tabs are either just documentation or spreadsheet-internal scratch work),
// computed live from each pilot's crew profile instead of hand-maintained.
// Column-by-column mapping back to that spreadsheet (reverse-engineered
// from its actual cell formulas):
//   Last IPC/Last PC       -> ipcPcRaw from crew.js withCurrency (seed-aware,
//                              but Last PC does NOT fall back to IPC - see
//                              lastPcOnly's own comment in crew.js)
//   IPC/PC Expiry          -> currency.ipc/proficiencyCheck.dueDate (already
//                              computed - EDATE(check,12) in the sheet is
//                              exactly nextDueRolling's 365-day rule here)
//   PC vs IPC Spacing/
//   Spacing Status/
//   Over-Under Run         -> ipcPcSpacingStatus (currency.js) - see that
//                              function's own comment for the exact bands
//   Override/Comment       -> crew_members.pc_ipc_override_comment, edited
//                              via the existing PATCH /api/crew/:id
//   Booked IPC/PC          -> whether an examiner is actually assigned to
//                              the planned check (plannedAssignedTo), not
//                              just a date on it - "Booked" in the sheet
//                              means confirmed, not merely estimated
//   Date IPC/PC            -> the planned date if one's been entered, else
//                              the computed due-date estimate (mirrors the
//                              sheet using a formula-driven estimate until
//                              a real booking is entered over the top)
//   Gap/Days to Run/
//   Closest Check          -> derived from Date IPC/PC exactly as the
//                              sheet's own formulas do (S/T/V columns)
//   Rostered               -> booked flag of whichever of IPC/PC is closer
//   Last Check + 365       -> addDays(earlier of Last IPC/Last PC, 365) -
//                              the regulatory ceiling the sheet's W column
//                              computes the same way
//   (trailing warning)     -> whether the currently planned Closest Check
//                              would land after that 365-day ceiling
router.get('/ipc-pc-spacing', async (req, res) => {
  const pilots = await listCrewWithCurrency({ type: 'PILOT' });

  const rows = pilots.map((m) => {
    const { lastIpc, lastPc } = m.ipcPcRaw || {};
    const ipcExpiry = m.currency.ipc?.dueDate || null;
    const pcExpiry = m.currency.proficiencyCheck?.dueDate || null;
    const spacing = ipcPcSpacingStatus(lastIpc, lastPc, !!m.pcIpcOverrideComment);

    const bookedIpc = !!m.currency.ipc?.plannedAssignedTo;
    const bookedPc = !!m.currency.proficiencyCheck?.plannedAssignedTo;
    const dateIpc = m.currency.ipc?.plannedDate || ipcExpiry;
    const datePc = m.currency.proficiencyCheck?.plannedDate || pcExpiry;

    const gapDays = (dateIpc && datePc)
      ? Math.round(Math.abs(new Date(datePc).getTime() - new Date(dateIpc).getTime()) / DAY_MS)
      : null;

    const futureDaysToRun = [daysUntil(dateIpc), daysUntil(datePc)].filter((d) => d !== null && d >= 0);
    const daysToRun = futureDaysToRun.length ? Math.min(...futureDaysToRun) : null;

    const closestCheck = earlierOf(dateIpc, datePc);
    const rostered = closestCheck === dateIpc ? bookedIpc : bookedPc;

    const lastCheckPlus365 = (lastIpc || lastPc) ? addDays(new Date(earlierOf(lastIpc, lastPc)), 365).toISOString() : null;
    const breach = !!(closestCheck && lastCheckPlus365 && new Date(closestCheck) > new Date(lastCheckPlus365));

    return {
      crewMemberId: m.id,
      name: m.name,
      fleet: m.fleets[0] || null,
      role: m.role,
      lastIpc, ipcExpiry, ipcDaysRemaining: daysUntil(ipcExpiry),
      lastPc, pcExpiry, pcDaysRemaining: daysUntil(pcExpiry),
      spacingDays: spacing?.spacingDays ?? null,
      spacingStatus: spacing?.status ?? null,
      overUnderRunDays: spacing?.overUnderRunDays ?? null,
      overrideComment: m.pcIpcOverrideComment || null,
      bookedIpc, bookedPc, dateIpc, datePc, gapDays, daysToRun, rostered,
      closestCheck, lastCheckPlus365, breach,
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
