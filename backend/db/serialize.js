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

module.exports = { rowToCamel };
