import { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client';

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Loose header matching, same reasoning as BulkImportCrew.jsx's own
// HEADER_MAP - and deliberately accepts Currency Overview's own export
// headers unchanged (Crew Member/ARN/Competency/Completed Date/Due Date),
// so exporting, editing in Excel, and re-importing just works. Type/Fleet/
// Competency Code/Status (also in that export) aren't needed for matching
// and are simply ignored if present.
const HEADER_MAP = {
  crewmember: 'crewMemberName', name: 'crewMemberName', crew: 'crewMemberName',
  arn: 'arn',
  competency: 'competencyName', competencyname: 'competencyName',
  completeddate: 'completedDate', completed: 'completedDate',
  duedate: 'dueDate', due: 'dueDate',
};

// AvSys "Crew Compliances Due" daily report (.htm export) - each row's
// Compliance cell is "<name> ( <qualifier codes> ) (<period days>)" and
// Name cell is "SURNAME Firstname". Casing doesn't matter for matching
// (the backend lowercases both crew name and competency name), only the
// word order and spelling do, so no need to re-case the surname.
function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Only the compliance types that map onto an actual FS competency type are
// listed here - Emergency Procedures/IPC/Proficiency Check/Line Check are
// recurrent-check dates on the crew record itself (not competencies), and
// everything else in the report has no matching FS competency type yet -
// both are deliberately skipped during import (per the operator's explicit
// "disregard for now"), not guessed at.
const AVSYS_COMPLIANCE_MAP = {
  [normalizeName('Medical')]: 'Medical',
  [normalizeName('Dangerous Goods')]: 'Dangerous Goods Awareness',
  [normalizeName('3 Yearly Smoke & Fire Training')]: '3 Yearly Smoke and Fire',
  [normalizeName('ASIC Renewal')]: 'ASIC',
  [normalizeName('EFB Training')]: 'EFB Administrator Training',
  [normalizeName('Examiner Proficiency Check')]: 'EPC - Examiner Proficiency Check',
  [normalizeName('Human Factors Supervisory')]: 'Human Factors (Supervisory)',
  [normalizeName('Maintenance Authority & Part 42 Training DASH')]: 'Maintenance Authority & Part 42 Training',
  [normalizeName('Maintenance Authority & Part 42 Training F100')]: 'Maintenance Authority & Part 42 Training',
  [normalizeName('Maintenance Authority & Part 42 Training M23')]: 'Maintenance Authority & Part 42 Training',
  [normalizeName('UPRT Course')]: 'UPRT',
  [normalizeName('Human Factors - 1')]: 'Human Factors - 1',
  [normalizeName('Human Factors - 2')]: 'Human Factors - 2',
  [normalizeName('Human Factors - 3')]: 'Human Factors - 3',
  [normalizeName('SMS Recurrent Training')]: 'SMS Recurrent Training',
  [normalizeName('Drug & Alcohol Training')]: 'Drug & Alcohol Training',
  [normalizeName('Skippers Aviation Fatigue Management')]: 'Skippers Aviation Fatigue Management',
  [normalizeName('C-FIT')]: 'C-FIT',
  [normalizeName('Provide First Aid')]: 'Provide First Aid',
  [normalizeName('CPR Refresher')]: 'CPR Refresher',
  [normalizeName('Professional Development Program - FER')]: 'Professional Development Program - FER',
  [normalizeName('Competency of Ground Instructor')]: 'Competency of Ground Instructor',
  [normalizeName('Train & Check involving Safety or Emerg Equip')]: 'Train & Check involving Safety or Emerg Equip',
  [normalizeName('Flight Instructor S&P Check')]: 'Flight Instructor S&P Check',
  [normalizeName('DAMP Supervisor')]: 'DAMP Supervisor',
  [normalizeName('CAO 20.11 Instruction')]: 'CAO 20.11 Instruction',
  // Raw text is "FIR (Instructor PC) (2555)" - the qualifier group and the
  // period group are both stripped by parseAvsysCompliance, same as every
  // other compliance's "( PW BC )"-style qualifier, leaving just "FIR".
  [normalizeName('FIR')]: 'FIR',
};

// e.g. "Dash 8 Check ( PW BC ) (730)" -> { baseName: 'Dash 8 Check', periodDays: 730 }.
// The qualifier group(s) in the middle and the period group at the end are
// both just "(...)" - only the last one is ever numeric, so it's taken as
// the period and every parenthesised group is stripped from the name.
function parseAvsysCompliance(raw) {
  const text = String(raw || '').trim();
  const groups = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const periodDigits = (groups[groups.length - 1] || '').match(/\d+/);
  return {
    baseName: text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(),
    periodDays: periodDigits ? parseInt(periodDigits[0], 10) : null,
  };
}

// "UNDERWOOD Garry" -> "Garry Underwood" - surname is however many leading
// all-caps tokens there are (handles multi-word surnames), first name is
// whatever's left.
function parseAvsysCrewName(raw) {
  const tokens = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return tokens.join(' ');
  let split = 0;
  while (split < tokens.length - 1 && tokens[split] === tokens[split].toUpperCase()) split++;
  return `${tokens.slice(split).join(' ')} ${tokens.slice(0, split).join(' ')}`.trim();
}

function parseAvsysDateDue(raw) {
  const m = String(raw || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function subtractDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// The report has no "completed date" field, only a due date - completed is
// derived as (due date - the compliance's own stated renewal period), which
// is already embedded per-row in the Compliance cell (see
// parseAvsysCompliance) rather than assumed globally.
function parseAvsysHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const trs = [...doc.querySelectorAll('tr')].filter((tr) => tr.querySelectorAll('td').length >= 8);
  const best = new Map();
  let scanned = 0;
  for (const tr of trs) {
    scanned++;
    const cells = tr.querySelectorAll('td');
    const { baseName, periodDays } = parseAvsysCompliance(cells[1]?.textContent);
    const competencyName = AVSYS_COMPLIANCE_MAP[normalizeName(baseName)];
    if (!competencyName) continue;
    const crewMemberName = parseAvsysCrewName(cells[3]?.textContent);
    const dueDate = parseAvsysDateDue(cells[5]?.textContent);
    if (!crewMemberName || !dueDate) continue;
    const completedDate = periodDays ? subtractDays(dueDate, periodDays) : null;
    // Same crew member can show up under more than one of the 3 fleet
    // variants of Maintenance Authority & Part 42 Training, which all map
    // onto FS's single (non-fleet-specific) competency type - keep the
    // soonest due date on a clash rather than whichever happened to parse last.
    const key = `${crewMemberName.toLowerCase()}::${competencyName.toLowerCase()}`;
    const existing = best.get(key);
    if (!existing || dueDate < existing.dueDate) {
      best.set(key, { crewMemberName, arn: '', competencyName, completedDate, dueDate });
    }
  }
  return { rows: [...best.values()], scanned };
}

function findHeaderRowIndex(sheet, maxScan = 5) {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  for (let i = 0; i < Math.min(maxScan, grid.length); i++) {
    const matches = (grid[i] || []).filter((cell) => HEADER_MAP[normalizeHeader(cell)]).length;
    if (matches >= 2) return i;
  }
  return 0;
}

// Excel cells come through as real Date objects (cellDates:true below), a
// typed string, or blank - all three need to end up as a plain YYYY-MM-DD
// string, same as BulkImportCrew.jsx's own normalizeDate.
function normalizeDate(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function mapRow(rawRow) {
  const mapped = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const field = HEADER_MAP[normalizeHeader(key)];
    if (field && value !== undefined && value !== '') mapped[field] = value;
  }
  return {
    crewMemberName: String(mapped.crewMemberName || '').trim(),
    arn: String(mapped.arn || '').trim(),
    competencyName: String(mapped.competencyName || '').trim(),
    completedDate: normalizeDate(mapped.completedDate) || null,
    dueDate: normalizeDate(mapped.dueDate) || null,
  };
}

// Bulk import of crew competency dates from a spreadsheet - the
// counterpart to Currency Overview's own "Export CSV" button. Mirrors
// BulkImportCrew.jsx's own upload/preview/report flow exactly.
export function BulkImportCompetencies() {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);

  async function handleFile(file) {
    setError(null);
    setReport(null);
    setRows(null);
    if (!file) return;
    setFileName(file.name);
    try {
      if (/\.html?$/i.test(file.name)) {
        const { rows: mapped, scanned } = parseAvsysHtml(await file.text());
        if (mapped.length === 0) {
          setError(`Found ${scanned} compliance row(s) in this report, but none matched a supported competency type (see the mapping list above) or had a usable due date.`);
          return;
        }
        setFileName(`${file.name} (${mapped.length} of ${scanned} compliance rows matched a supported competency type)`);
        setRows(mapped);
        return;
      }
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', range: findHeaderRowIndex(sheet) });
      if (raw.length === 0) { setError('No rows found in the first sheet of this file.'); return; }
      if (raw.length > 1000) { setError(`This file has ${raw.length} rows - the maximum per import is 1000. Split it into smaller batches.`); return; }
      const mapped = raw.map(mapRow);
      const isBlankRow = (r) => !r.crewMemberName && !r.arn && !r.competencyName;
      if (mapped.every(isBlankRow)) {
        const headers = Object.keys(raw[0] || {}).filter((h) => !/^__EMPTY/.test(h));
        setError(`None of this file's columns were recognized${headers.length ? ` (found: ${headers.join(', ')})` : ''}. Check the first row of the sheet is the actual column headers - Crew Member, ARN, Competency, Completed Date, Due Date - not a title row sitting above them.`);
        return;
      }
      setRows(mapped.filter((r) => !isBlankRow(r)));
    } catch (err) {
      setError(`Could not read that file: ${err.message}`);
    }
  }

  async function runImport() {
    setImporting(true);
    setError(null);
    try {
      const result = await api.post('/api/crew/competencies/bulk-import', { rows });
      setReport(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setRows(null);
    setFileName('');
    setReport(null);
    setError(null);
  }

  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Bulk import competency dates from a spreadsheet</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Upload an Excel (.xlsx) or CSV file - one row per crew member/competency. Expected columns: Crew
          Member (or ARN - pilots), Competency (must match an existing competency name exactly, e.g.
          "Dangerous Goods"), Completed Date, Due Date. This accepts Currency Overview's own "Export CSV"
          file unchanged - export, edit in Excel, then re-import. Matches either a catalog competency (set
          up on the Syllabus tab) or a one-off competency already on that crew member's own Competencies
          tab - either way it only ever updates an existing one's dates, it won't create a new competency
          type or one-off competency from scratch. Rows for Emergency Procedures/IPC/Proficiency Check/Line
          Check/Life Jacket/Smoke & Fire/F100 Slide (not competencies) are skipped, not failed.
          <br /><br />
          Also accepts AvSys's "Crew Compliances Due" report (.htm) directly - only these compliance types
          are recognised and imported, everything else in the report is skipped: Medical, Dangerous Goods,
          3 Yearly Smoke &amp; Fire Training, ASIC Renewal, EFB Training, Examiner Proficiency Check, Human
          Factors Supervisory, Maintenance Authority &amp; Part 42 Training (any fleet), UPRT Course, Human
          Factors - 1/2/3, SMS Recurrent Training, Drug &amp; Alcohol Training, Skippers Aviation Fatigue
          Management, C-FIT, Provide First Aid, CPR Refresher, Professional Development Program - FER,
          Competency of Ground Instructor, Train &amp; Check involving Safety or Emerg Equip, Flight
          Instructor S&amp;P Check, DAMP Supervisor, CAO 20.11 Instruction, FIR. Recurrent-check dates
          (Emergency Procedures/IPC/Proficiency Check/Line Check/RHS Check) aren't competencies and are
          always skipped here. The report has no completed date, so it's derived as the due date minus
          that compliance's own stated renewal period.
        </div>
        <input type="file" accept=".xlsx,.xls,.csv,.htm,.html" onChange={(e) => handleFile(e.target.files[0])} />
        {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      {rows && !report && (
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 8 }}>{fileName} - {rows.length} row{rows.length === 1 ? '' : 's'} found</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Crew Member', 'ARN', 'Competency', 'Completed Date', 'Due Date'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)', padding: '4px 8px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.crewMemberName}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.arn}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.competencyName}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.completedDate || ''}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.dueDate || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>…and {rows.length - 10} more row(s)</div>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0' }}>
            Check this looks right before importing - a crew member or competency name that can't be matched will fail and be reported below, not guessed at.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={runImport} disabled={importing}>
              {importing ? 'Importing…' : `Import ${rows.length} row${rows.length === 1 ? '' : 's'}`}
            </button>
            <button onClick={reset} disabled={importing}>Cancel</button>
          </div>
        </div>
      )}

      {report && (
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 8 }}>{report.imported} imported, {report.skipped} skipped, {report.failed} failed</div>
          {report.results.map((r) => (
            <div key={r.row} className="card row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>Row {r.row}{r.name ? ` — ${r.name}` : ''}{r.competency ? ` — ${r.competency}` : ''}</div>
                {r.status !== 'imported' && <div style={{ fontSize: 12, color: r.status === 'error' ? 'var(--text-danger)' : 'var(--text-secondary)' }}>{r.error}</div>}
              </div>
              <span className={`badge ${r.status === 'imported' ? 'pass' : r.status === 'skipped' ? '' : 'fail'}`}>
                {r.status === 'imported' ? 'Imported' : r.status === 'skipped' ? 'Skipped' : 'Failed'}
              </span>
            </div>
          ))}
          <button onClick={reset} style={{ marginTop: 8 }}>Import another file</button>
        </div>
      )}
    </div>
  );
}
