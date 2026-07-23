import { useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api/client';
import { formatFleet } from '../lib/format';

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// A real-world roster spreadsheet is never going to use this app's own
// field names, so header matching is deliberately loose - lowercased,
// punctuation/spacing stripped, and a handful of synonyms per field.
const HEADER_MAP = {
  firstname: 'firstName', first: 'firstName',
  lastname: 'lastName', last: 'lastName', surname: 'lastName',
  type: 'type',
  role: 'role', rank: 'role',
  fleet: 'fleets', fleets: 'fleets', aircrafttype: 'fleets',
  arn: 'arn',
  lastepdate: 'lastEpDate', epdate: 'lastEpDate', emergencyproceduresdate: 'lastEpDate',
  lastipcdate: 'lastIpcDate', ipcdate: 'lastIpcDate',
  lastpcdate: 'lastPcDate', pcdate: 'lastPcDate', lastproficiencycheckdate: 'lastPcDate', proficiencycheckdate: 'lastPcDate',
  linecheckanchordate: 'lineCheckAnchorDate', initialchecktolinedate: 'lineCheckAnchorDate',
  checktolinedate: 'lineCheckAnchorDate', initiallinecheckdate: 'lineCheckAnchorDate',
  lastlinecheckdate: 'lastLineCheckDate', linecheckdate: 'lastLineCheckDate',
};

const FLEET_NAME_TO_CODE = {
  DASH8: 'DASH_8', DHC8: 'DASH_8',
  FOKKER100: 'FOKKER_100', F100: 'FOKKER_100',
  METRO: 'METRO_23', METRO23: 'METRO_23',
  CABINDASH8: 'CA_DASH_8', CADASH8: 'CA_DASH_8',
  CABINFOKKER100: 'CA_FOKKER_100', CAFOKKER100: 'CA_FOKKER_100',
};

function normalizeFleetToken(v) {
  const raw = String(v || '').trim();
  if (FLEET_VALUES.includes(raw.toUpperCase())) return raw.toUpperCase();
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return FLEET_NAME_TO_CODE[key] || raw;
}

function normalizeFleets(v) {
  return String(v || '').split(/[,;/]+/).map((s) => s.trim()).filter(Boolean).map(normalizeFleetToken);
}

function normalizeType(v) {
  const s = String(v || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (['CA', 'CABIN_ATTENDANT', 'CABINCREW', 'CABIN_CREW'].includes(s)) return 'CABIN_ATTENDANT';
  if (s === 'PILOT') return 'PILOT';
  return s;
}

function normalizeRole(v) {
  const s = String(v || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (['FO', 'F_O', 'FIRSTOFFICER', 'FIRST_OFFICER'].includes(s)) return 'FIRST_OFFICER';
  if (['CAPT', 'CAPTAIN'].includes(s)) return 'CAPTAIN';
  if (['CA', 'CABIN_ATTENDANT', 'CABINATTENDANT'].includes(s)) return 'CABIN_ATTENDANT';
  return s;
}

// Excel cells come through as real Date objects (cellDates:true below), a
// typed string, or blank - all three need to end up as a plain YYYY-MM-DD
// string, which is what the API's seed-date fields expect.
function normalizeDate(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

// Maps one raw spreadsheet row onto the same shape the "Quick add crew
// member" form itself posts (see backend/src/routes/crew.js's
// quickAddSchema) - deliberately not validated here, just normalized; the
// backend runs the real schema per row and reports back exactly what's
// wrong with each one, rather than this silently guessing.
function mapRow(rawRow) {
  const mapped = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const field = HEADER_MAP[normalizeHeader(key)];
    if (field && value !== undefined && value !== '') mapped[field] = value;
  }
  const row = {
    firstName: String(mapped.firstName || '').trim(),
    lastName: String(mapped.lastName || '').trim(),
    type: normalizeType(mapped.type),
    role: normalizeRole(mapped.role),
    fleets: normalizeFleets(mapped.fleets),
  };
  if (mapped.arn) row.arn = String(mapped.arn).trim();
  const lastEpDate = normalizeDate(mapped.lastEpDate);
  const lastIpcDate = normalizeDate(mapped.lastIpcDate);
  const lastPcDate = normalizeDate(mapped.lastPcDate);
  const lineCheckAnchorDate = normalizeDate(mapped.lineCheckAnchorDate);
  const lastLineCheckDate = normalizeDate(mapped.lastLineCheckDate);
  if (lastEpDate) row.lastEpDate = lastEpDate;
  if (lastIpcDate) row.lastIpcDate = lastIpcDate;
  if (lastPcDate) row.lastPcDate = lastPcDate;
  if (lineCheckAnchorDate) row.lineCheckAnchorDate = lineCheckAnchorDate;
  if (lastLineCheckDate) row.lastLineCheckDate = lastLineCheckDate;
  return row;
}

export function BulkImportCrew() {
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
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (raw.length === 0) { setError('No rows found in the first sheet of this file.'); return; }
      if (raw.length > 500) { setError(`This file has ${raw.length} rows - the maximum per import is 500. Split it into smaller batches.`); return; }
      setRows(raw.map(mapRow));
    } catch (err) {
      setError(`Could not read that file: ${err.message}`);
    }
  }

  async function runImport() {
    setImporting(true);
    setError(null);
    try {
      const result = await api.post('/api/crew/bulk-import', { rows });
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
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Bulk import crew from a spreadsheet</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Upload an Excel (.xlsx) or CSV file - one row per crew member. Expected columns: First Name,
          Last Name, Type (Pilot/Cabin Attendant), Role (Captain/First Officer/Cabin Attendant), Fleet
          (e.g. Dash 8, Fokker 100, Metro - separate with a comma if more than one), ARN (pilots only),
          and any seed dates already on file: Last EP Date, Last IPC Date, Last PC Date, Line Check
          Anchor Date (pilots), Last Line Check Date (cabin attendants). Column names are matched
          loosely and blank dates are fine to leave out.
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
                  {['Name', 'Type', 'Role', 'Fleet(s)', 'ARN'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)', padding: '4px 8px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.firstName} {r.lastName}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.type}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.role}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{(r.fleets || []).map(formatFleet).join(', ')}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)' }}>{r.arn || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>…and {rows.length - 10} more row(s)</div>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0' }}>
            Check this looks right before importing - Type/Role/Fleet must be recognised exactly; a row
            with something unrecognised will fail and be reported below, not guessed at.
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
          <div style={{ fontWeight: 500, marginBottom: 8 }}>{report.created} created, {report.failed} failed</div>
          {report.results.map((r) => (
            <div key={r.row} className="card row" style={{ cursor: 'default' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>Row {r.row}{r.name ? ` — ${r.name}` : ''}</div>
                {r.status === 'error' && <div style={{ fontSize: 12, color: 'var(--text-danger)' }}>{r.error}</div>}
              </div>
              <span className={`badge ${r.status === 'created' ? 'pass' : 'fail'}`}>{r.status === 'created' ? 'Created' : 'Failed'}</span>
            </div>
          ))}
          <button onClick={reset} style={{ marginTop: 8 }}>Import another file</button>
        </div>
      )}
    </div>
  );
}
