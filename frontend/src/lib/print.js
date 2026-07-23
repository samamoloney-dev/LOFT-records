// Opens a plain popup window with a print-formatted version of a record and
// triggers the browser's native print dialog - the user picks "Save as
// PDF" themselves. Kept separate from the app's own stylesheet so the
// interactive edit UI (inputs, buttons) never has to double as a print
// layout.
import { formatDate } from './format';
import { SKIPPERS_LOGO_DATA_URI } from '../assets/skippersLogo';

// Colour palette lifted directly from the operator's own SA518 Flight
// Standards Personnel (Air) Competency Check paper form (the two navy
// shades used on its section header rows, and the light blue/grey used for
// alternating row shading) - applied here so every printed form in the app
// matches the paper forms it's digitising, not an arbitrary house style.
const NAVY_DARK = '#003366';
const NAVY_MID = '#1A5276';
const ROW_TINT = '#D6E4F0';
const ROW_TINT_ALT = '#F0F0F0';

// @page margin is now just generic page-edge whitespace - the letterhead
// and footer no longer need extra room reserved for them here (see the
// <table>/<thead>/<tfoot> comment on openPrintWindow below for why).
const PAGE_MARGIN_TOP_MM = 10;
const PAGE_MARGIN_BOTTOM_MM = 10;
const PAGE_MARGIN_SIDE_MM = 14;
const PAGE_HEIGHT_MM = 297; // A4

const PRINT_STYLES = `
  @page { size: A4; margin: ${PAGE_MARGIN_TOP_MM}mm ${PAGE_MARGIN_SIDE_MM}mm ${PAGE_MARGIN_BOTTOM_MM}mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 12px; margin: 0; padding: 0 2px; }

  /* .print-shell's <thead>/<tfoot> are what actually repeat the letterhead
     and footer on every printed page - the browser's own native "repeat
     table header/footer rows on each page" behaviour, not position:fixed.
     An earlier version tried position:fixed with a computed top/bottom
     offset to sit the letterhead/footer inside the page margin, but Chrome's
     print engine got that pagination wrong in practice (the letterhead
     ended up at the bottom of page 1 and the footer at the top of page 2
     instead of repeating correctly) - thead/tfoot repeat is the standard,
     reliable mechanism for this exact problem, so the layout uses that
     instead of fighting fixed-position pagination quirks further. */
  table.print-shell { width: 100%; border-collapse: collapse; }
  .print-shell > thead > tr > td, .print-shell > tbody > tr > td, .print-shell > tfoot > tr > td { padding: 0; border: none; background: none; }

  .letterhead {
    display: flex; justify-content: space-between; align-items: flex-start;
    font-size: 10px; color: #444; text-transform: uppercase; letter-spacing: 0.08em;
    border-bottom: 3px double ${NAVY_DARK}; padding: 0 0 6px; margin: 0 0 6mm;
  }
  .letterhead b { font-size: 12px; color: #111; letter-spacing: 0.04em; }
  .letterhead img { height: 30px; display: block; margin-left: auto; }

  h1 {
    font-size: 19px; margin: 10px 0 16px; padding-bottom: 10px; font-weight: 800; letter-spacing: 0.01em;
    text-transform: uppercase; text-align: center; border-bottom: 1px solid #ccc; color: ${NAVY_DARK};
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
  /* No overflow:hidden here - it was clipping section content that ran
     longer than a page/column (a long Flight Component list), cutting off
     the tail end of sentences. The header bar rounds its own top corners
     instead of relying on the container clipping it. */
  .form-section { border: 1px solid #b9bfc7; border-radius: 3px; margin-bottom: 12px; break-inside: avoid; -webkit-column-break-inside: avoid; }
  .form-section h2 {
    font-size: 11.5px; margin: 0; padding: 6px 10px;
    background: ${NAVY_DARK}; color: #fff; border-radius: 2px 2px 0 0;
    text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700;
  }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 6px 10px; border-bottom: 1px solid #e4e6ea; text-align: left; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: ${ROW_TINT_ALT}; }
  /* No nowrap - a long section title (e.g. Meeting Minutes' "Review of
     Checking and Training Outcomes and Feedback") forced onto one line
     was expanding this column at the content column's expense, squeezing
     it down to a sliver and forcing whatever long text sat opposite it
     into a very tall, awkwardly-paginated mess. Letting a long label wrap
     onto 2-3 lines instead keeps both columns a stable, sane width. */
  .label { color: ${NAVY_MID}; width: 36%; font-weight: 600; }

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

  .print-footer {
    padding: 6px 0 0; border-top: 1px solid #ccc; margin-top: 6mm; display: flex; justify-content: space-between; font-size: 9.5px; color: #777;
  }
  /* One of these is injected per estimated page (see paginate() in
     openPrintWindow below) at the computed vertical offset for that
     page's bottom margin band - .print-footer repeats identical text on
     every page (that's the point of putting it in <tfoot>), so "Page X of
     Y" (which differs per page) can't live there; this absolutely
     positioned overlay is the workaround. Estimated from total rendered
     content height plus the measured header/footer height, since nothing
     exposes real print pagination to the DOM - close enough to be useful,
     not pixel-exact on documents with a lot of break-avoided sections. */
  .page-number { position: absolute; right: ${PAGE_MARGIN_SIDE_MM}mm; font-size: 9.5px; color: #777; }

  /* Below: a closer, plain black-ruled replica of the paper checklist
     forms (e.g. SA 489/492 Part 121 Proficiency Check/IPC) - title +
     boxed ARN, a 2x2 field grid, and an Item No/Activities/MOS/Result
     ruled table with subsection header rows, rather than the softer
     boxed-card look used elsewhere in this file. */
  .form-title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin: 6px 0 14px; }
  .form-title-row h1 { margin: 0; padding: 0; border: none; text-align: left; font-size: 17px; }

  .arn-boxes { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .arn-boxes b { font-size: 11px; }
  .arn-boxes .boxes { display: flex; }
  .arn-boxes .boxes span {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 22px; border: 1px solid #000; border-left: none;
    font-weight: 700; font-size: 11px;
  }
  .arn-boxes .boxes span:first-child { border-left: 1px solid #000; }

  .field-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; margin-bottom: 10px; }
  .field-grid > div { padding: 5px 8px; border-right: 1px solid #000; border-bottom: 1px solid #000; }
  .field-grid > div:nth-child(2n) { border-right: none; }
  .field-grid > div:nth-last-child(-n+2) { border-bottom: none; }
  .field-grid label { font-weight: 700; margin-right: 5px; }

  .check-table { border: 1px solid #000; margin-bottom: 10px; }
  .check-table.two-col { column-count: 2; column-gap: 14px; column-rule: 1px solid #000; }
  .check-row { display: grid; border-bottom: 1px solid #000; break-inside: avoid; -webkit-column-break-inside: avoid; }
  .check-row > div { padding: 3px 6px; border-right: 1px solid #000; overflow-wrap: break-word; }
  .check-row > div:last-child { border-right: none; text-align: center; }
  .check-head { font-weight: 700; background: ${NAVY_MID}; color: #fff; font-size: 10px; text-transform: uppercase; }
  .check-subhead {
    font-weight: 700; background: ${ROW_TINT}; padding: 3px 6px; text-align: center;
    border-bottom: 1px solid #000; break-inside: avoid; -webkit-column-break-inside: avoid;
  }

  .seat-check { border: 1px solid #000; margin-bottom: 10px; }
  .seat-check-title { text-align: center; font-weight: 700; padding: 5px; border-bottom: 1px solid #000; text-transform: uppercase; font-size: 11px; }
  .seat-check-title small { display: block; font-weight: 400; text-transform: none; font-size: 9.5px; margin-top: 2px; }
  .seat-check-row { display: grid; grid-template-columns: repeat(3, 1fr); }
  .seat-check-row > div { padding: 5px 8px; border-right: 1px solid #000; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; }
  .seat-check-row > div:last-child { border-right: none; }
  .seat-check-row .mark { font-weight: 700; }

  .labeled-row-group { border: 1px solid #000; margin-bottom: 10px; }
  .labeled-row { display: grid; border-bottom: 1px solid #000; }
  .labeled-row:last-child { border-bottom: none; }
  .labeled-row .row-label { padding: 5px 8px; font-weight: 700; border-right: 1px solid #000; display: flex; align-items: center; font-size: 11px; background: ${ROW_TINT}; }
  .labeled-row > div:not(.row-label) { padding: 8px 6px 4px; border-right: 1px solid #000; text-align: center; }
  .labeled-row > div:last-child { border-right: none; }
  .labeled-row .cell-value { min-height: 14px; font-weight: 600; margin-bottom: 3px; }
  .labeled-row small { display: block; font-size: 8.5px; color: #555; text-transform: uppercase; letter-spacing: 0.02em; }

  /* Denser rendering for long item-checklist forms (e.g. IPC/PC) so they
     fit their intended page count instead of running several pages long -
     tightened further (a single straggler row/box was enough to spill onto
     an otherwise-empty extra page) rather than leaving that up to chance. */
  .compact h1 { font-size: 15px; margin-bottom: 8px; padding-bottom: 5px; }
  .compact .meta { font-size: 10.5px; margin-bottom: 5px; padding: 4px 8px; }
  .compact .form-section { margin-bottom: 5px; }
  .compact .form-section h2 { font-size: 10px; padding: 4px 8px; }
  .compact td, .compact th { padding: 3px 8px; line-height: 1.3; }
  .compact .field-grid { margin-bottom: 5px; }
  .compact .field-grid > div { padding: 3px 8px; }
  .compact .check-table { margin-bottom: 5px; }
  .compact .seat-check { margin-bottom: 0; }
  .compact .seat-check-title { padding: 3px; }
  .compact .seat-check-row > div { padding: 3px 8px; }
  .columns-2 { column-count: 2; column-gap: 16px; }
  .compact-section { break-inside: avoid; -webkit-column-break-inside: avoid; }
  .compact .check-row > div, .compact .check-head { padding: 1.5px 5px; font-size: 9.5px; line-height: 1.15; }
  .compact .check-subhead { padding: 1.5px 5px; font-size: 9.5px; }
`;

// Estimates how many printed pages the content will span from its plain
// (unpaginated) rendered height, then injects one "Page X of Y" label per
// estimated page at the vertical offset where that page's bottom margin
// band should fall - see the .page-number comment above for why this is
// necessary instead of a single repeating element. Approximate (there's no
// way to read real print pagination from the DOM), but close enough to be
// useful, and always at least "Page 1 of 1" for a single-page form.
function paginate(win) {
  const content = win.document.getElementById('print-content');
  const container = win.document.getElementById('page-numbers');
  const thead = win.document.querySelector('.print-shell thead');
  const tfoot = win.document.querySelector('.print-shell tfoot');
  if (!content || !container) return;
  const pxPerMm = 96 / 25.4;
  const theadPx = thead?.offsetHeight || 0;
  const tfootPx = tfoot?.offsetHeight || 0;
  // thead/tfoot repeat on every physical printed page (see the .print-shell
  // comment above), so their height comes out of every page's usable
  // budget, not just the first/last - and #print-content's own flow
  // position starts theadPx below the top of the (single, on-screen)
  // continuous layout, since thead only renders once in the DOM/flow that
  // JS can measure (the print engine duplicates it visually per page only
  // during the print itself, invisible to script).
  const pageContentHeightPx = (PAGE_HEIGHT_MM - PAGE_MARGIN_TOP_MM - PAGE_MARGIN_BOTTOM_MM) * pxPerMm - theadPx - tfootPx;
  const totalPages = Math.max(1, Math.ceil(content.scrollHeight / pageContentHeightPx));
  let html = '';
  for (let i = 0; i < totalPages; i++) {
    // A little above the boundary between this page's content and the
    // next, so the label lands inside this page rather than spilling
    // onto the next one.
    const top = theadPx + (i + 1) * pageContentHeightPx - 18;
    html += `<div class="page-number" style="top:${top}px">Page ${i + 1} of ${totalPages}</div>`;
  }
  container.innerHTML = html;
}

export function openPrintWindow(title, bodyHtml) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return;
  // Skippers logo top-right on every printed page, per the operator's
  // request - a <thead>/<tfoot> row repeats natively on every physical
  // sheet when a table spans multiple printed pages, which is what
  // actually keeps the letterhead/footer in place (see the .print-shell
  // comment in PRINT_STYLES for why this replaced position:fixed).
  const letterhead = `<div class="letterhead"><b>Flight Standards System</b><div style="text-align:right;"><img src="${SKIPPERS_LOGO_DATA_URI}" alt="Skippers" /><span style="display:block;margin-top:2px;">Printed ${formatDate(new Date())}</span></div></div>`;
  const footer = `<div class="print-footer"><span>Flight Standards System</span><span>System-generated record</span></div>`;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLES}</style></head><body><table class="print-shell"><thead><tr><td>${letterhead}</td></tr></thead><tfoot><tr><td>${footer}</td></tr></tfoot><tbody><tr><td id="print-content">${bodyHtml}</td></tr></tbody></table><div id="page-numbers"></div></body></html>`);
  win.document.close();
  const doPrint = () => {
    try { paginate(win); } catch { /* a print without page numbers is still usable */ }
    try { win.focus(); win.print(); } catch { /* window may already be closed */ }
  };
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

// Title on the left, a boxed ARN readout on the right - mirrors the top
// of the paper checklist forms (SA 489/492 etc). value is split one
// character per box; boxCount defaults to 7 (Skippers ARNs are 6-7 digits).
export function arnBoxes(label, value, boxCount = 7) {
  const chars = (value || '').split('').slice(0, boxCount);
  while (chars.length < boxCount) chars.push('');
  return `<div class="arn-boxes"><b>${label}</b><div class="boxes">${chars.map((c) => `<span>${c}</span>`).join('')}</div></div>`;
}

export function formTitleRow(title, arnValue) {
  return `<div class="form-title-row"><h1>${title}</h1>${arnValue !== undefined ? arnBoxes("Applicant's ARN", arnValue) : ''}</div>`;
}

// A plain 2x2 (or Nx2) bordered field grid - "Candidate Name / Date",
// "Assessor(s) / Aircraft Type" - matching the paper form's top field
// rows, rather than the single grey .meta line used elsewhere.
export function fieldGrid(pairs) {
  const cells = pairs.map(([label, value]) => `<div><label>${label}</label>${value || ''}</div>`).join('');
  return `<div class="field-grid">${cells}</div>`;
}

// A ruled Item/Tick table - the Upgrade Record forms' (SA 507/510/522/523)
// own "Tick | Item" briefing/simulator-training columns, rather than the
// softer boxed .form-section table used elsewhere. `rows` is a list of
// either { header: 'Subsection title' } or { description, tick } item rows
// (tick already resolved to 'Yes'/'No'/'').
export function tickTable(rows) {
  const cols = '1fr 60px';
  const head = `<div class="check-row check-head" style="grid-template-columns:${cols}"><div>Item</div><div>Tick</div></div>`;
  const body = rows.map((r) => {
    if (r.header) return `<div class="check-subhead">${r.header}</div>`;
    return `<div class="check-row" style="grid-template-columns:${cols}"><div>${r.description}</div><div>${r.tick ?? ''}</div></div>`;
  }).join('');
  return `<div class="check-table">${head}${body}</div>`;
}

// A ruled Item No/Activities and Manoeuvres/MOS/Result checklist table,
// with subsection header rows spanning the full width - replicates the
// paper form's own table structure instead of a boxed card per section.
// `rows` is a list of either { header: 'Subsection title' } or
// { no, description, mos, result } item rows. Pass twoColumn:true to flow
// the whole table across two newspaper-style columns (for long lists like
// the IPC's ~50 items) - individual rows never split across the break.
export function checklistTable(rows, { withItemNo = true, twoColumn = false } = {}) {
  const cols = withItemNo ? '26px 1fr 62px 48px' : '1fr 90px 48px';
  const headCells = withItemNo ? ['No', 'Activities and Manoeuvres', 'MOS', 'Result'] : ['Activities and Manoeuvres', 'MOS', 'Result'];
  const head = `<div class="check-row check-head" style="grid-template-columns:${cols}">${headCells.map((c) => `<div>${c}</div>`).join('')}</div>`;
  const body = rows.map((r) => {
    if (r.header) return `<div class="check-subhead">${r.header}</div>`;
    const cells = withItemNo ? [r.no, r.description, r.mos, r.result] : [r.description, r.mos, r.result];
    return `<div class="check-row" style="grid-template-columns:${cols}">${cells.map((c) => `<div>${c ?? ''}</div>`).join('')}</div>`;
  }).join('');
  return `<div class="check-table${twoColumn ? ' two-col' : ''}">${head}${body}</div>`;
}

// "Seat check conducted in" box - a tick for whichever seat(s) were
// actually used, matching the paper form's own boxed column layout.
// Defaults match ProficiencyChecks (LHS/RHS/Other Seat); Pilot Line Check
// passes its own two-seat list and title (see PilotLineCheck.jsx).
export function seatCheckBox(seatCheck, seats = ['LHS', 'RHS', 'Other Seat'], title = 'Seat check conducted in', caption = 'Training captains in LHS and Other, F.O. in RHS, Captains in LHS') {
  const cells = seats.map((s) => `<div>${s}<span class="mark">${seatCheck.includes(s) ? '✓' : ''}</span></div>`).join('');
  return `
    <div class="seat-check">
      <div class="seat-check-title">${title}${caption ? `<br/><small>${caption}</small>` : ''}</div>
      <div class="seat-check-row">${cells}</div>
    </div>`;
}

// One row of a bordered admin-details block ("Applicant", "FSTD",
// "Examiner" etc. on the paper form's page 2) - a row label on the left,
// then one cell per value with its caption underneath.
export function labeledRow(rowLabel, cells) {
  const cols = `100px repeat(${cells.length}, 1fr)`;
  const cellHtml = cells
    .map((c) => `<div><div class="cell-value">${c.value || '&nbsp;'}</div><small>${c.label}</small></div>`)
    .join('');
  return `<div class="labeled-row" style="grid-template-columns:${cols}"><div class="row-label">${rowLabel}</div>${cellHtml}</div>`;
}

export function labeledRowGroup(rows) {
  return `<div class="labeled-row-group">${rows.map((r) => labeledRow(r.label, r.cells)).join('')}</div>`;
}
