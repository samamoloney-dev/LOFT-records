const express = require('express');
const pool = require('../../db/pool');
const { parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { listCrewWithCurrency } = require('./crew');
const { getRecentActivity } = require('../lib/activity');

const router = express.Router();

// Home Dashboard is HOTC/HOFO/Flight Ops Admin/Alternate only (v1) - the
// only roles with a whole-organization view today. Every number here is
// computed from data that already exists elsewhere (crew currency,
// checks, trainees, planning) - nothing here is a new source of truth,
// it's all aggregation over the same queries Currency Overview/Planning/
// Trainees already use, so the views can never disagree.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

// A crew member's currency/competency items aren't fleet-specific
// themselves (they belong to the person, e.g. Dangerous Goods), so a
// member holding more than one fleet counts toward each of them - matches
// how Currency Overview's own new fleet filter (frontend/src/pages/
// CurrencyOverview.jsx) already attributes a member's rows to every fleet
// they hold.
function fleetSnapshotFrom(members) {
  const stats = Object.fromEntries(FLEET_VALUES.map((f) => [f, { current: 0, total: 0 }]));
  for (const m of members) {
    for (const fleet of m.fleets) {
      if (!stats[fleet]) continue;
      stats[fleet].total += m.allItems.length;
      stats[fleet].current += m.allItems.filter((i) => i.status === 'ok').length;
    }
  }
  return FLEET_VALUES.map((fleet) => ({
    fleet,
    current: stats[fleet].current,
    total: stats[fleet].total,
    percent: stats[fleet].total ? Math.round((stats[fleet].current / stats[fleet].total) * 100) : null,
  }));
}

function daysOverdue(dueDate) {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const today = new Date();
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((todayDay - dueDay) / (24 * 60 * 60 * 1000));
}

router.get('/summary', async (req, res) => {
  const members = await listCrewWithCurrency({ archived: false });
  const allItems = members.flatMap((m) => m.allItems.map((item) => ({ ...item, member: m })));

  const overdueItems = allItems.filter((i) => i.status === 'overdue');
  const dueSoonItems = allItems.filter((i) => i.status === 'due_soon');
  const notCompletedItems = allItems.filter((i) => i.status === 'not_completed');
  const currentCount = allItems.filter((i) => i.status === 'ok').length;

  const [
    { rows: activeTraineesRows },
    { rows: inTrainingChecksRows },
    { rows: flightsRows },
    { rows: groundSchoolRows },
    { rows: plannedChecksRows },
    { rows: plannedCompetenciesRows },
    { rows: traineeRows },
    { rows: groundSchoolProgressRows },
    { rows: caProgressRows },
    { rows: lastActivityRows },
    recentActivity,
  ] = await Promise.all([
    // "Active" = not yet past Check to Line, i.e. still going through
    // initial training rather than tracked as line-qualified crew.
    pool.query(
      `SELECT COUNT(*)::int AS n FROM trainees t
       WHERE t.archived = false
         AND NOT EXISTS (SELECT 1 FROM check_to_line_forms ctl WHERE ctl.trainee_id = t.id AND ctl.completed_at IS NOT NULL)`,
    ),
    pool.query('SELECT COUNT(*)::int AS n FROM checks WHERE result IS NULL AND archived = false'),
    // Non-archived flights with at least one syllabus item not yet signed
    // off - a stalled sign-off backlog, not the flight-in-progress case.
    pool.query(
      `SELECT f.trainee_id, f.id AS flight_id, f.date, t.first_name, t.last_name,
              COUNT(fsp.syllabus_item_id)::int AS outstanding
       FROM flights f
       JOIN trainees t ON t.id = f.trainee_id
       JOIN flight_syllabus_progress fsp ON fsp.flight_id = f.id AND fsp.completed_at IS NULL
       WHERE f.archived = false AND t.archived = false
       GROUP BY f.trainee_id, f.id, f.date, t.first_name, t.last_name
       HAVING COUNT(fsp.syllabus_item_id) > 0
       ORDER BY outstanding DESC`,
    ),
    // Required ground school items not yet completed (and not N/A) per
    // trainee - blocks them progressing to the simulator.
    pool.query(
      `SELECT t.id AS trainee_id, t.first_name, t.last_name, t.fleet, COUNT(*)::int AS outstanding
       FROM trainees t
       JOIN ground_school_items gsi ON gsi.fleet = t.fleet AND gsi.required = true
       LEFT JOIN ground_school_progress gsp ON gsp.ground_school_item_id = gsi.id AND gsp.trainee_id = t.id
       WHERE t.archived = false
         AND gsp.completed_at IS NULL AND COALESCE((gsp.details->>'na')::boolean, false) = false
       GROUP BY t.id, t.first_name, t.last_name, t.fleet
       ORDER BY outstanding DESC`,
    ),
    pool.query(
      `SELECT pc.crew_member_id, pc.check_key, pc.planned_date, pc.assigned_to_name, cm.first_name, cm.last_name, cm.fleets, cm.type
       FROM crew_planned_checks pc
       JOIN crew_members cm ON cm.id = pc.crew_member_id
       WHERE cm.archived = false AND pc.planned_date IS NOT NULL
         AND pc.planned_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY pc.planned_date ASC`,
    ),
    pool.query(
      `SELECT cc.crew_member_id, cc.planned_date, ct.name, cm.first_name, cm.last_name, cm.fleets
       FROM crew_competencies cc
       JOIN competency_types ct ON ct.id = cc.competency_type_id
       JOIN crew_members cm ON cm.id = cc.crew_member_id
       WHERE cc.planned_date IS NOT NULL AND cm.archived = false
         AND (ct.applies_to IS NULL OR ct.applies_to = cm.type)
         AND cc.planned_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY cc.planned_date ASC`,
    ),
    pool.query(
      `SELECT id, first_name, last_name, type, role, fleet, phase FROM trainees
       WHERE archived = false ORDER BY last_name ASC`,
    ),
    // Ground school completion fraction (pilots) - an N/A item counts the
    // same as completed, mirroring hasIncompleteGroundSchool's own "not
    // outstanding" definition above.
    pool.query(
      `SELECT t.id AS trainee_id,
              COUNT(*) FILTER (WHERE gsp.completed_at IS NOT NULL OR COALESCE((gsp.details->>'na')::boolean, false))::int AS complete,
              COUNT(*)::int AS total
       FROM trainees t
       JOIN ground_school_items gsi ON gsi.fleet = t.fleet AND gsi.required = true
       LEFT JOIN ground_school_progress gsp ON gsp.ground_school_item_id = gsi.id AND gsp.trainee_id = t.id
       WHERE t.archived = false AND t.type = 'PILOT'
       GROUP BY t.id`,
    ),
    // Flight count + required-tasks sign-off fraction (cabin crew) - each
    // flight carries its own copy of the required tasks (see migration
    // 0007's flight_syllabus_progress comment), so this is a running total
    // across every flight they've ever logged, not just the latest one.
    pool.query(
      `SELECT t.id AS trainee_id,
              COUNT(DISTINCT f.id)::int AS flight_count,
              COUNT(fsp.syllabus_item_id) FILTER (WHERE fsp.completed_at IS NOT NULL)::int AS loft_complete,
              COUNT(fsp.syllabus_item_id)::int AS loft_total
       FROM trainees t
       LEFT JOIN flights f ON f.trainee_id = t.id
       LEFT JOIN flight_syllabus_progress fsp ON fsp.flight_id = f.id
       WHERE t.archived = false AND t.type = 'CABIN_ATTENDANT'
       GROUP BY t.id`,
    ),
    pool.query(
      `SELECT t.id AS trainee_id, GREATEST(
         t.created_at,
         (SELECT MAX(created_at) FROM flights WHERE trainee_id = t.id),
         (SELECT MAX(completed_at) FROM ground_school_progress WHERE trainee_id = t.id),
         (SELECT MAX(completed_at) FROM syllabus_progress WHERE trainee_id = t.id),
         (SELECT MAX(fsp.completed_at) FROM flight_syllabus_progress fsp JOIN flights f ON f.id = fsp.flight_id WHERE f.trainee_id = t.id),
         (SELECT completed_at FROM check_to_line_forms WHERE trainee_id = t.id),
         (SELECT MAX(completed_at) FROM phase_completions WHERE trainee_id = t.id)
       ) AS last_activity
       FROM trainees t WHERE t.archived = false`,
    ),
    getRecentActivity(15),
  ]);

  const CHECK_LABELS = {
    emergencyProcedures: 'Emergency Procedures', ipc: 'IPC', proficiencyCheck: 'Proficiency Check', lineCheck: 'Line Check',
  };

  const needsAttention = [
    ...overdueItems
      .slice()
      // A currency item can be "overdue" with no due date at all - never
      // completed and nothing to compute a rolling due date from (see
      // crew.js dueInfo) - those are the most urgent, so they sort first.
      .sort((a, b) => (b.dueDate ? daysOverdue(b.dueDate) : Infinity) - (a.dueDate ? daysOverdue(a.dueDate) : Infinity))
      .map((i) => ({
        key: `currency:${i.member.id}:${i.label}`,
        text: i.dueDate
          ? `${i.member.name} — ${i.label} — overdue by ${daysOverdue(i.dueDate)} day${daysOverdue(i.dueDate) === 1 ? '' : 's'}`
          : `${i.member.name} — ${i.label} — never completed`,
        linkTo: `/crew/${i.member.id}`,
      })),
    ...flightsRows.map((r) => ({
      key: `flight:${r.flight_id}`,
      text: `${r.first_name} ${r.last_name} — Flight ${new Date(r.date).toISOString().slice(0, 10)} — ${r.outstanding} item${r.outstanding === 1 ? '' : 's'} not yet signed off`,
      linkTo: `/trainees/${r.trainee_id}`,
    })),
    ...groundSchoolRows.map((r) => ({
      key: `groundschool:${r.trainee_id}`,
      text: `${r.first_name} ${r.last_name} — ${r.outstanding} course${r.outstanding === 1 ? '' : 's'}/exam${r.outstanding === 1 ? '' : 's'} outstanding before simulator`,
      linkTo: `/trainees/${r.trainee_id}`,
    })),
  ];

  const comingUp = [
    ...plannedChecksRows.map((r) => ({
      key: `check:${r.crew_member_id}:${r.check_key}`,
      date: new Date(r.planned_date).toISOString().slice(0, 10),
      crewMemberName: `${r.first_name} ${r.last_name}`,
      fleets: parsePgArray(r.fleets),
      label: CHECK_LABELS[r.check_key] || r.check_key,
      assignedToName: r.assigned_to_name,
      isCheck: true,
      linkTo: `/crew/${r.crew_member_id}`,
    })),
    ...plannedCompetenciesRows.map((r) => ({
      key: `competency:${r.crew_member_id}:${r.name}`,
      date: new Date(r.planned_date).toISOString().slice(0, 10),
      crewMemberName: `${r.first_name} ${r.last_name}`,
      fleets: parsePgArray(r.fleets),
      label: r.name,
      assignedToName: null,
      isCheck: false,
      linkTo: `/crew/${r.crew_member_id}`,
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  const gsByTrainee = Object.fromEntries(groundSchoolProgressRows.map((r) => [r.trainee_id, r]));
  const caByTrainee = Object.fromEntries(caProgressRows.map((r) => [r.trainee_id, r]));
  const lastActivityByTrainee = Object.fromEntries(lastActivityRows.map((r) => [r.trainee_id, r.last_activity]));

  const STALE_DAYS = 14;
  const traineeProgress = traineeRows.map((t) => {
    const lastActivity = lastActivityByTrainee[t.id] || null;
    const daysSinceActivity = lastActivity
      ? Math.round((Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const base = {
      id: t.id,
      name: `${t.first_name} ${t.last_name}`,
      fleet: t.fleet,
      type: t.type,
      lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
      stalled: daysSinceActivity === null || daysSinceActivity >= STALE_DAYS,
      linkTo: `/trainees/${t.id}`,
    };
    if (t.type === 'PILOT') {
      const gs = gsByTrainee[t.id] || { complete: 0, total: 0 };
      return { ...base, phase: t.phase, groundSchoolComplete: gs.complete, groundSchoolTotal: gs.total };
    }
    const ca = caByTrainee[t.id] || { flight_count: 0, loft_complete: 0, loft_total: 0 };
    return { ...base, flightCount: ca.flight_count, loftComplete: ca.loft_complete, loftTotal: ca.loft_total };
  });

  res.json({
    summary: {
      overdue: overdueItems.length,
      dueSoon: dueSoonItems.length,
      notCompleted: notCompletedItems.length,
      activeTrainees: activeTraineesRows[0].n,
      inTrainingChecks: inTrainingChecksRows[0].n,
      crewCurrentPercent: allItems.length ? Math.round((currentCount / allItems.length) * 100) : 100,
    },
    needsAttention: needsAttention.slice(0, 8),
    needsAttentionTotal: needsAttention.length,
    comingUp: comingUp.slice(0, 8),
    fleetSnapshot: fleetSnapshotFrom(members),
    traineeProgress,
    recentActivity,
  });
});

module.exports = router;
