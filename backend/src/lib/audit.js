const pool = require('../../db/pool');

async function logAction({ userId, action, targetTable, targetId }) {
  await pool.query(
    'INSERT INTO audit_log (user_id, action, target_table, target_id) VALUES ($1, $2, $3, $4)',
    [userId || null, action, targetTable, targetId || null],
  );
}

module.exports = { logAction };
