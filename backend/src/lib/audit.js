const pool = require('../../db/pool');

// description is optional and only worth passing at call sites whose
// event is meaningful enough for the Home Dashboard's Recent Activity
// feed (see backend/src/lib/activity.js, which only reads rows where
// this is set) - most callers can omit it entirely.
async function logAction({ userId, action, targetTable, targetId, description }) {
  await pool.query(
    'INSERT INTO audit_log (user_id, action, target_table, target_id, description) VALUES ($1, $2, $3, $4, $5)',
    [userId || null, action, targetTable, targetId || null, description || null],
  );
}

module.exports = { logAction };
