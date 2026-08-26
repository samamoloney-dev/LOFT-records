// Quotes a cell only when it actually needs it (contains a comma, quote or
// newline) - keeps the common case readable if this file is ever opened
// and eyeballed rather than fed straight into another system.
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Triggers a browser download of a CSV built from headers + rows - no
// server round-trip, since this is just reformatting data the page already
// has. CRLF line endings (not \n) so the file opens cleanly in Excel too,
// which is the most likely destination for this given who it's for.
export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
