// Opens a plain popup window with a print-formatted version of a record and
// triggers the browser's native print dialog - the user picks "Save as
// PDF" themselves. Kept separate from the app's own stylesheet so the
// interactive edit UI (inputs, buttons) never has to double as a print
// layout.
const PRINT_STYLES = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; padding: 16px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 14px 0 6px; border-bottom: 1px solid #999; padding-bottom: 2px; }
  .meta { font-size: 12px; color: #444; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td, th { padding: 3px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  .label { color: #555; width: 40%; white-space: nowrap; }
  .disclaimer { font-style: italic; color: #555; margin: 10px 0; font-size: 11px; }
  .sig-row { display: flex; gap: 20px; margin-top: 10px; }
  .sig { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 11px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
  .pass { background: #dff5e1; color: #14632f; }
  .fail { background: #fbe1e1; color: #8f1d1d; }
  .page-break { break-before: page; }
`;

export function openPrintWindow(title, bodyHtml) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  const doPrint = () => { try { win.focus(); win.print(); } catch { /* window may already be closed */ } };
  win.onload = doPrint;
  setTimeout(doPrint, 300);
}

export function section(title, rows) {
  const body = rows
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `<tr><td class="label">${label}</td><td>${value ?? ''}</td></tr>`)
    .join('');
  return `<h2>${title}</h2><table>${body}</table>`;
}

export function signatureBlock(items) {
  return `<div class="sig-row">${items.map(([label, value]) => `<div class="sig">${value || '&nbsp;'}<br/><small>${label}</small></div>`).join('')}</div>`;
}

export function resultBadge(result) {
  if (!result) return '—';
  return `<span class="badge ${result === 'PASS' ? 'pass' : 'fail'}">${result}</span>`;
}
