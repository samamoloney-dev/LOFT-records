const express = require('express');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { applyToTable, DIRECT_EDIT_ROLES } = require('../lib/approvals');

const router = express.Router();

router.use(requireAuth);
// Reviewing/approving a curriculum change is HOTC's call specifically (per
// the operator's explicit rule) - Alternate gets the same access since it
// mirrors HOTC everywhere else in the app (see lib/approvals.js).
router.use(requireRole(...DIRECT_EDIT_ROLES));

router.get('/', async (req, res) => {
  const status = req.query.status || 'PENDING';
  const { rows } = await pool.query(
    'SELECT * FROM content_change_requests WHERE status = $1 ORDER BY created_at ASC',
    [status],
  );
  res.json(rows.map(rowToCamel));
});

async function findPending(id, res) {
  const { rows } = await pool.query('SELECT * FROM content_change_requests WHERE id = $1', [id]);
  if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return null; }
  const change = rowToCamel(rows[0]);
  if (change.status !== 'PENDING') { res.status(400).json({ error: 'This change has already been reviewed' }); return null; }
  return change;
}

router.post('/:id/approve', async (req, res) => {
  const change = await findPending(req.params.id, res);
  if (!change) return;

  const result = await applyToTable(change.tableName, change.action, change.itemId, change.proposedData);

  const { rows } = await pool.query(
    `UPDATE content_change_requests SET status = 'APPROVED', reviewed_by = $1, reviewed_by_name = $2, reviewed_at = now()
     WHERE id = $3 RETURNING *`,
    [req.user.id, req.user.name, change.id],
  );
  await logAction({
    userId: req.user.id, action: 'APPROVE', targetTable: 'content_change_requests', targetId: change.id,
    description: `Approved: ${change.summary}`,
  });
  res.json({ changeRequest: rowToCamel(rows[0]), result });
});

router.post('/:id/reject', async (req, res) => {
  const change = await findPending(req.params.id, res);
  if (!change) return;

  const { rows } = await pool.query(
    `UPDATE content_change_requests SET status = 'REJECTED', reviewed_by = $1, reviewed_by_name = $2, reviewed_at = now()
     WHERE id = $3 RETURNING *`,
    [req.user.id, req.user.name, change.id],
  );
  await logAction({
    userId: req.user.id, action: 'REJECT', targetTable: 'content_change_requests', targetId: change.id,
    description: `Rejected: ${change.summary}`,
  });
  res.json(rowToCamel(rows[0]));
});

module.exports = router;
