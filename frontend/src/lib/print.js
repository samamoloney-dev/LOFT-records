// Opens a plain popup window with a print-formatted version of a record and
// triggers the browser's native print dialog - the user picks "Save as
// PDF" themselves. Kept separate from the app's own stylesheet so the
// interactive edit UI (inputs, buttons) never has to double as a print
// layout.
import { formatDate } from './format';

const PRINT_STYLES = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; padding: 16px; }
  .letterhead {
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em;
    border-bottom: 2px solid #222; padding-bottom: 6px; margin-bottom: 14px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; font-weight: 700; }
  h2 {
    font-size: 12.5px; margin: 16px 0 6px; padding: 4px 8px;
    background: #eef1f5; border-left: 3px solid #55606e;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .meta { font-size: 11.5px; color: #555; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #ccc; }
  td, th { padding: 5px 8px; border: 1px solid #ddd; text-align: left; vertical-align: top; }
  .label { background: #f4f4f4; color: #333; width: 38%; white-space: nowrap; font-weight: 600; }
  .disclaimer { font-style: italic; color: #444; margin: 12px 0; font-size: 10.5px; padding: 6px 8px; background: #fafafa; border-left: 2px solid #ccc; }
  .sig-row { display: flex; gap: 24px; margin-top: 16px; }
  .sig { flex: 1; border-top: 1.5px solid #333; padding-top: 6px; font-size: 11px; min-height: 18px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
  .pass { background: #dff5e1; color: #14632f; }
  .fail { background: #fbe1e1; color: #8f1d1d; }
  .page-break { break-before: page; }
`;

export function openPrintWindow(title, bodyHtml) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  const letterhead = `<div class="letterhead"><span>Flight Standards System</span><span>Printed ${formatDate(new Date())}</span></div>`;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${letterhead}${bodyHtml}</body></html>`);
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
