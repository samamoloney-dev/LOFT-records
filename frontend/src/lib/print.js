// Opens a plain popup window with a print-formatted version of a record and
// triggers the browser's native print dialog - the user picks "Save as
// PDF" themselves. Kept separate from the app's own stylesheet so the
// interactive edit UI (inputs, buttons) never has to double as a print
// layout.
import { formatDate } from './format';

const PRINT_STYLES = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; padding: 0 2px; }

  .letterhead {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 10px; color: #444; text-transform: uppercase; letter-spacing: 0.08em;
    border-bottom: 3px double #1a1a1a; padding-bottom: 8px; margin-bottom: 4px;
  }
  .letterhead b { font-size: 12px; color: #111; letter-spacing: 0.04em; }

  h1 {
    font-size: 19px; margin: 10px 0 16px; padding-bottom: 10px; font-weight: 800; letter-spacing: 0.01em;
    text-transform: uppercase; text-align: center; border-bottom: 1px solid #ccc;
  }

  /* The one line of "who/what/when" context every form opens with -
     styled as its own boxed strip so it reads as the form's top field
     row, not a stray line of grey text. */
  .meta {
    font-size: 12.5px; color: #222; font-weight: 500; margin: 0 0 16px;
    padding: 8px 12px; background: #f6f7f9; border: 1px solid #d7dbe0; border-radius: 3px;
  }

  /* Each section renders as its own bordered box with a solid title bar,
     mirroring the paper forms' own boxed sections rather than a plain
     table with a shaded left rule. */
  .form-section { border: 1px solid #b9bfc7; border-radius: 3px; margin-bottom: 12px; break-inside: avoid; -webkit-column-break-inside: avoid; overflow: hidden; }
  .form-section h2 {
    font-size: 11.5px; margin: 0; padding: 6px 10px;
    background: #2c333d; color: #fff;
    text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;
  }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 10px; border-bottom: 1px solid #e4e6ea; text-align: left; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fafbfc; }
  .label { color: #444; width: 36%; white-space: nowrap; font-weight: 600; }

  .disclaimer { font-style: italic; color: #444; margin: 14px 0; font-size: 10.5px; padding: 8px 10px; background: #fafafa; border: 1px solid #e0e0e0; border-left: 3px solid #888; border-radius: 2px; }

  /* Mimics the paper form's "sign here" line - the recorded signer's name
     sits where a wet-ink signature would go, on its own rule, captioned
     underneath rather than a boxed field. */
  .sig-row { display: flex; gap: 32px; margin-top: 22px; padding-top: 6px; }
  .sig { flex: 1; text-align: center; }
  .sig .sig-value { font-family: 'Brush Script MT', cursive; font-size: 17px; min-height: 22px; display: block; border-bottom: 1.5px solid #333; padding-bottom: 4px; }
  .sig small { display: block; margin-top: 4px; font-size: 9.5px; color: #555; text-transform: uppercase; letter-spacing: 0.04em; }

  .badge { display: inline-block; padding: 2px 10px; border-radius: 3px; font-weight: 700; font-size: 11px; letter-spacing: 0.02em; }
  .pass { background: #dff5e1; color: #14632f; }
  .fail { background: #fbe1e1; color: #8f1d1d; }
  .page-break { break-before: page; }

  .print-footer { margin-top: 20px; padding-top: 6px; border-top: 1px solid #ccc; display: flex; justify-content: space-between; font-size: 9.5px; color: #777; }

  /* Denser rendering for long item-checklist forms (e.g. IPC/PC) so they
     fit their intended page count instead of running several pages long. */
  .compact h1 { font-size: 15px; margin-bottom: 10px; padding-bottom: 6px; }
  .compact .meta { font-size: 10.5px; margin-bottom: 8px; padding: 5px 8px; }
  .compact .form-section { margin-bottom: 6px; }
  .compact .form-section h2 { font-size: 10px; padding: 4px 8px; }
  .compact td, .compact th { padding: 3px 8px; line-height: 1.3; }
  .columns-2 { column-count: 2; column-gap: 16px; }
  .compact-section { break-inside: avoid; -webkit-column-break-inside: avoid; }
`;

export function openPrintWindow(title, bodyHtml) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  const letterhead = `<div class="letterhead"><b>Flight Standards System</b><span>Printed ${formatDate(new Date())}</span></div>`;
  const footer = `<div class="print-footer"><span>Flight Standards System</span><span>System-generated record</span></div>`;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLES}</style></head><body>${letterhead}${bodyHtml}${footer}</body></html>`);
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
  return `<div class="form-section"><h2>${title}</h2><table>${body}</table></div>`;
}

export function signatureBlock(items) {
  return `<div class="sig-row">${items.map(([label, value]) => `<div class="sig"><span class="sig-value">${value || '&nbsp;'}</span><small>${label}</small></div>`).join('')}</div>`;
}

export function resultBadge(result) {
  if (!result) return '—';
  return `<span class="badge ${result === 'PASS' ? 'pass' : 'fail'}">${result}</span>`;
}
