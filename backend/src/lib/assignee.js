const pool = require('../../db/pool');

// Resolves an assigned_to user id into the display fields (name + ARN + role)
// a check/CTL form needs, so the ARN and specific role title show up
// automatically wherever that person is assigned as assessor.
async function resolveAssignee(assignedTo) {
  if (!assignedTo) return { assignedToName: null, assignedToArn: null, assignedToRole: null };
  const { rows } = await pool.query('SELECT name, arn, role FROM users WHERE id = $1', [assignedTo]);
  return {
    assignedToName: rows[0]?.name || null,
    assignedToArn: rows[0]?.arn || null,
    assignedToRole: rows[0]?.role || null,
  };
}

module.exports = { resolveAssignee };
