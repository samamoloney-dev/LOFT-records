const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');

// HOTC edits curriculum directly, same as before this queue existed.
// Alternate mirrors HOTC access everywhere else in the app (see
// middleware/roles.js ADMIN_ROLES comment), so it gets the same pass-through
// here rather than being forced through its own approval queue.
const DIRECT_EDIT_ROLES = ['HOTC', 'ALTERNATE'];

function canEditDirectly(user) {
  return DIRECT_EDIT_ROLES.includes(user.role);
}

// Applies a curriculum change immediately for HOTC/Alternate, or queues it
// as a pending content_change_requests row for anyone else (e.g. the Cabin
// Attendant Manager editing a cabin attendant syllabus/ground school item) -
// see the operator's rule that any non-HOTC change must be reviewed and
// approved before it takes effect.
async function requestOrApply({ req, tableName, action, itemId, proposedData, previousData, summary, applyFn }) {
  if (canEditDirectly(req.user)) {
    const result = await applyFn();
    return { applied: true, result };
  }

  const { rows } = await pool.query(
    `INSERT INTO content_change_requests
       (table_name, action, item_id, proposed_data, previous_data, summary, created_by, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      tableName, action, itemId || null,
      proposedData ? JSON.stringify(proposedData) : null,
      previousData ? JSON.stringify(previousData) : null,
      summary, req.user.id, req.user.name,
    ],
  );
  return { applied: false, pending: rowToCamel(rows[0]) };
}

// Column maps mirror the two curriculum routes' own (syllabus.js/
// ground-school.js) - centralised here so the approve endpoint can apply a
// previously-queued change with the exact same mutation logic used for a
// direct (HOTC/Alternate) edit.
const COLUMN_MAPS = {
  syllabus_items: {
    fleet: 'fleet', roleScope: 'role_scope', phase: 'phase', category: 'category',
    section: 'section', description: 'description', notes: 'notes', required: 'required',
    syllabusId: 'syllabus_id',
  },
  ground_school_items: {
    fleet: 'fleet', category: 'category', description: 'description', notes: 'notes', required: 'required',
    syllabusId: 'syllabus_id',
  },
};

async function applyToTable(tableName, action, itemId, data) {
  const columnMap = COLUMN_MAPS[tableName];
  if (action === 'CREATE') {
    const entries = Object.entries(data);
    const columns = entries.map(([key]) => columnMap[key]);
    const placeholders = entries.map((_, i) => `$${i + 1}`);
    const values = entries.map(([, value]) => value);
    const { rows } = await pool.query(
      `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values,
    );
    return rowToCamel(rows[0]);
  }
  if (action === 'UPDATE') {
    const entries = Object.entries(data);
    const setClauses = entries.map(([key], i) => `${columnMap[key]} = $${i + 1}`);
    const values = entries.map(([, value]) => value);
    values.push(itemId);
    const { rows } = await pool.query(
      `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0] ? rowToCamel(rows[0]) : null;
  }
  const { rows } = await pool.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING *`, [itemId]);
  return rows[0] ? rowToCamel(rows[0]) : null;
}

module.exports = { requestOrApply, applyToTable, canEditDirectly, DIRECT_EDIT_ROLES };
