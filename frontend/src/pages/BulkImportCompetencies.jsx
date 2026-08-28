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
          file unchanged - export, edit in Excel, then re-import. Only updates competencies already set up
          on the Syllabus tab - it won't create new ones, and rows for Emergency Procedures/IPC/Proficiency
          Check/Line Check/Life Jacket/Smoke & Fire/F100 Slide (not competencies) are skipped, not failed.
        </div>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleFile(e.target.files[0])} />
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
