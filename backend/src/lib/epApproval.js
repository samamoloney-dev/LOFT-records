const pool = require('../../db/pool');
const { parsePgArray } = require('../../db/serialize');

// Emergency Procedures, wet drills (Life Jacket), 3-yearly Smoke & Fire and
// F100 Slide training may only be conducted by staff holding the CASA 121.010
// approval - recorded as the "Emergency procedures" check access tick on their
// FS Staff profile. Nobody else qualifies by role alone, including HOTC, HOFO,
// Alternate, Examiners and the Cabin Attendant Manager.
const EP_FAMILY_CHECK_TYPES = ['EMERGENCY_PROCEDURES', 'LIFE_JACKET', 'SMOKE_FIRE_TRAINING', 'F100_SLIDE_TRAINING'];

function hasEpApproval(user) {
  return (user.checkAccess || []).includes('EMERGENCY_PROCEDURES');
}

const NOT_APPROVED_ASSIGNEE_ERROR = 'Only staff holding the CASA 121.010 approval (the Emergency procedures tick on their FS Staff profile) can be assigned this check';

// Returns an error message if this user can't be assigned an EP-family check,
// or null if they can (or there's nobody to validate).
async function epAssigneeError(userId) {
  if (!userId) return null;
  const { rows } = await pool.query('SELECT check_access FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) return 'Assignee not found';
  return parsePgArray(rows[0].check_access).includes('EMERGENCY_PROCEDURES') ? null : NOT_APPROVED_ASSIGNEE_ERROR;
}

module.exports = { EP_FAMILY_CHECK_TYPES, hasEpApproval, epAssigneeError };
