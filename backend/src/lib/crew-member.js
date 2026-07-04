const pool = require('../../db/pool');

// Resolves a crew_member id into the display name a check needs, snapshotted
// as plain text (same pattern as resolveAssignee) so it survives the crew
// member later being archived/removed.
async function resolveCrewMember(crewMemberId) {
  if (!crewMemberId) return { crewMemberName: null };
  const { rows } = await pool.query(
    'SELECT first_name, last_name FROM crew_members WHERE id = $1',
    [crewMemberId],
  );
  if (!rows[0]) return { crewMemberName: null };
  return { crewMemberName: `${rows[0].first_name} ${rows[0].last_name}` };
}

module.exports = { resolveCrewMember };
