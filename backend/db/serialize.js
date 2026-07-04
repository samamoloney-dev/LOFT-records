function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function rowToCamel(row) {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[toCamel(key)] = value;
  }
  return out;
}

// node-postgres doesn't know how to decode arrays of custom enum types, so
// columns like check_access come back as raw "{PC,IPC}" literals.
function parsePgArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  const trimmed = value.replace(/^\{|\}$/g, '');
  if (trimmed === '') return [];
  return trimmed.split(',').map((s) => s.replace(/^"|"$/g, ''));
}

module.exports = { rowToCamel, parsePgArray };
