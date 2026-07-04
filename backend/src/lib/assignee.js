const pool = require('../../db/pool');

// Resolves an assigned_to user id into the display fields (name + ARN) a
// check/CTL form needs, so the ARN on a staff profile shows up automatically
// wherever that person is assigned as assessor.
async function resolveAssignee(assignedTo) {
  if (!assignedTo) return { assignedToName: null, assignedToArn: null };
  const { rows } = await pool.query('SELECT name, arn FROM users WHERE id = $1', [assignedTo]);
  return { assignedToName: rows[0]?.name || null, assignedToArn: rows[0]?.arn || null };
}

module.exports = { resolveAssignee };
