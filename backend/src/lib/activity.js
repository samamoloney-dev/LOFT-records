const pool = require('../../db/pool');

// Only the call sites that pass a description (see backend/src/lib/audit.js)
// are meant to surface here - everything else logged via logAction (every
// competency date save, every PIN verify, every login) stays out of the
// feed entirely rather than needing a separate allowlist to filter it.
//
// Most of those call sites were deliberately written with targetId set to
// the trainee's own id (not the row's own id) precisely so linking needs
// no further lookup here - see crew.js/syllabus.js/ground-school.js/ctl.js/
// phase4.js/landing-assessment.js's logAction calls for
// check_to_line_forms/phase4_assessments/landing_assessment_forms/
// phase_completions/ground_school_progress/syllabus_progress/
// flight_syllabus_progress. checks is the one exception (a check has no
// single owning trainee/crew route of its own), resolved below via a
// batched lookup.
const TRAINEE_LINKED_TABLES = new Set([
  'trainees', 'check_to_line_forms', 'phase4_assessments', 'landing_assessment_forms',
  'phase_completions', 'ground_school_progress', 'syllabus_progress', 'flight_syllabus_progress',
]);

async function getRecentActivity(limit = 15) {
  const { rows } = await pool.query(
    `SELECT al.id, al.action, al.target_table, al.target_id, al.description, al.timestamp, u.name AS actor_name
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.description IS NOT NULL
     ORDER BY al.timestamp DESC
     LIMIT $1`,
    [limit],
  );

  const checkIds = rows.filter((r) => r.target_table === 'checks').map((r) => r.target_id);
  const checksById = new Map();
  if (checkIds.length) {
    const { rows: checkRows } = await pool.query(
      'SELECT id, crew_member_id, trainee_id FROM checks WHERE id = ANY($1::uuid[])',
      [checkIds],
    );
    checkRows.forEach((c) => checksById.set(c.id, c));
  }

  return rows.map((r) => {
    let linkTo = '/syllabus'; // competency_types/check_form_items/syllabus_items/ground_school_items - no per-item route
    if (r.target_table === 'crew_members') {
      linkTo = `/crew/${r.target_id}`;
    } else if (TRAINEE_LINKED_TABLES.has(r.target_table)) {
      linkTo = `/trainees/${r.target_id}`;
    } else if (r.target_table === 'checks') {
      const c = checksById.get(r.target_id);
      linkTo = c?.crew_member_id ? `/crew/${c.crew_member_id}` : c?.trainee_id ? `/trainees/${c.trainee_id}` : '/checks';
    }
    return {
      id: r.id,
      actorName: r.actor_name || 'System',
      description: r.description,
      timestamp: r.timestamp,
      linkTo,
    };
  });
}

module.exports = { getRecentActivity };
