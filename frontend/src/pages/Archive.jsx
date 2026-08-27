import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet } from '../lib/format';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { ArchivedFlights } from './ArchivedFlights';
import { ArchivedCheckToLine } from './ArchivedCheckToLine';
import { ArchivedUpgrades } from './ArchivedUpgrades';
import { TabBar } from '../components/TabBar';
import { viewPdf } from '../lib/pdf';

// Archived trainees (whole trainee records, archived automatically when
// their Check to Line completes) - kept as-is under the Others tab, since
// it's a different concept from archiving an individual check/flight.
function ArchivedTrainees() {
  const [trainees, setTrainees] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/trainees?archived=true').then(setTrainees).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Archived trainees</div>
      {error && <div className="error-text">{error}</div>}
      {trainees.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No archived trainees.</div>}
      {trainees.map((t) => (
        <div key={t.id} className="card row" onClick={() => navigate(`/trainees/${t.id}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{t.firstName} {t.lastName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatFleet(t.fleet)} · Archived {t.archivedAt ? formatDate(t.archivedAt) : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Every archived document across the whole roster, searchable by document
// name or crew member name - per the operator's explicit requirement that
// an archived document must stay findable later. Once a document is
// archived from a crew profile's own Documents tab, there's no other way
// to relocate it without remembering exactly whose profile it was filed
// under, so this exists as the one global place to look. Debounced
// (300ms) rather than fetching on every keystroke, since this is a real
// database round trip across every crew member, not a client-side filter
// over data already on the page.
function ArchivedDocuments() {
  const [q, setQ] = useState('');
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      api.get(`/api/crew/documents/archived?q=${encodeURIComponent(q)}`)
        .then(setDocuments)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  async function view(doc) {
    setError(null);
    try {
      const full = await api.get(`/api/crew/${doc.crewMemberId}/documents/${doc.id}`);
      viewPdf(full.fileData);
    } catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Every archived document across the whole roster - search by document name or crew member name.
      </div>
      <div className="field" style={{ maxWidth: 360 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by document or crew member name" />
      </div>
      {error && <div className="error-text">{error}</div>}
      {!loading && documents.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          {q ? 'No archived documents match that search.' : 'No archived documents.'}
        </div>
      )}
      {documents.map((d) => (
        <div key={d.id} className="card row" onClick={() => view(d)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{d.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {d.crewMemberName} · {d.fileName}
              {d.archivedAt ? ` · Archived ${formatDate(d.archivedAt)}` : ''}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); view(d); }}>View</button>
        </div>
      ))}
    </div>
  );
}

// Reads a File as a base64 data URI - same approach as CrewDetail.jsx's own
// readFileAsDataUrl, duplicated here rather than shared since this page has
// no import path to a component file.
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

// Mirrors CrewDetail.jsx's nameFromFileName - strips the extension and
// turns dashes/underscores into spaces, so a batch import doesn't leave
// every document named after its raw filename.
function nameFromFileName(fileName) {
  return fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || fileName;
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Guesses which crew member a scanned document belongs to from its
// filename - requires a last name match, and if more than one crew member
// shares a last name, also requires a first name match to disambiguate.
// Anything still ambiguous (or with no match at all) is left blank rather
// than risking a document landing on the wrong person's profile - the
// operator picks it manually instead.
function guessMemberId(fileName, members) {
  const norm = normalize(fileName);
  const byBoth = members.filter((m) => {
    const last = normalize(m.lastName);
    const first = normalize(m.firstName);
    return last && norm.includes(last) && first && norm.includes(first);
  });
  if (byBoth.length === 1) return byBoth[0].id;
  const byLastOnly = members.filter((m) => {
    const last = normalize(m.lastName);
    return last && norm.includes(last);
  });
  return byLastOnly.length === 1 ? byLastOnly[0].id : '';
}

// Imports many scanned documents across the whole roster in one go, rather
// than having to open each crew member's own profile and upload one at a
// time - each file is auto-matched to a crew member by filename (last
// name, and first name too if more than one person shares it), with a
// dropdown to fix or fill in any that couldn't be guessed confidently.
// Reuses the existing per-document POST route underneath (one request per
// file, sequential so a partial failure doesn't leave things interleaved),
// so no separate bulk endpoint exists on the backend.
function BulkImportDocuments() {
  const [members, setMembers] = useState([]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    Promise.all([api.get('/api/crew?type=PILOT'), api.get('/api/crew?type=CABIN_ATTENDANT')])
      .then(([pilots, cas]) => setMembers([...pilots, ...cas].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setError(e.message));
  }, []);

  function addFiles(files) {
    if (!files || files.length === 0) return;
    setDoneCount(0);
    setRows((prev) => [
      ...prev,
      ...files.map((file) => ({
        file,
        fileName: file.name,
        name: nameFromFileName(file.name),
        crewMemberId: guessMemberId(file.name, members),
      })),
    ]);
  }

  function updateRow(i, patch) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function importAll() {
    if (rows.some((r) => !r.crewMemberId)) {
      setError('Pick a crew member for every document before importing.');
      return;
    }
    setError(null);
    setBusy(true);
    const remaining = [];
    try {
      for (let i = 0; i < rows.length; i++) {
        setProgress({ done: i, total: rows.length });
        const r = rows[i];
        try {
          const fileData = await readFileAsDataUrl(r.file);
          await api.post(`/api/crew/${r.crewMemberId}/documents`, { name: r.name, fileName: r.fileName, fileData });
          setDoneCount((n) => n + 1);
        } catch (err) {
          remaining.push({ ...r, error: err.message });
        }
      }
    } finally {
      setRows(remaining);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Import many scanned documents at once across the whole roster - each file is matched to a crew member by
        filename where possible (fix or fill in any that couldn't be guessed), then imported straight to that
        person's own Documents tab.
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="field">
          <label>{busy ? (progress ? `Importing ${progress.done + 1} of ${progress.total}…` : 'Importing…') : 'Select PDF(s) to import'}</label>
          <input
            type="file" accept="application/pdf" multiple disabled={busy}
            onChange={(e) => { const files = [...e.target.files]; e.target.value = ''; addFiles(files); }}
          />
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {doneCount > 0 && rows.length === 0 && !busy && (
        <div className="card" style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}>
          Imported {doneCount} document{doneCount === 1 ? '' : 's'}.
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
            <label>{r.fileName}{r.error ? ` - failed: ${r.error}` : ''}</label>
            <input value={r.name} disabled={busy} onChange={(e) => updateRow(i, { name: e.target.value })} placeholder="Document name" />
          </div>
          <div className="field" style={{ margin: 0, flex: '1 1 220px' }}>
            <label>Crew member</label>
            <select value={r.crewMemberId} disabled={busy} onChange={(e) => updateRow(i, { crewMemberId: e.target.value })}>
              <option value="">— Select crew member —</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <button disabled={busy} onClick={() => removeRow(i)}>Remove</button>
        </div>
      ))}
      {rows.length > 0 && (
        <button className="primary" disabled={busy} onClick={importAll}>
          Import {rows.length} document{rows.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}

export function Archive() {
  const topTabs = [
    { key: 'pilots', label: 'Pilots' },
    { key: 'cabin-attendants', label: 'Cabin Attendants' },
    { key: 'specialist', label: 'Specialist' },
    { key: 'documents', label: 'Documents' },
    { key: 'others', label: 'Others' },
  ];
  const [topTab, setTopTab] = useState('pilots');

  const pilotTabs = [
    { key: 'loft', label: 'LOFT Records' },
    { key: 'ipc', label: 'IPC' },
    { key: 'pc', label: 'PC' },
    { key: 'ep', label: 'Emergency Procedures' },
  ];
  const [pilotTab, setPilotTab] = useState('loft');

  const caTabs = [
    { key: 'loft', label: 'LOFT Records' },
    { key: 'ctl', label: 'Check to Line' },
    { key: 'linecheck', label: 'Line Check' },
    { key: 'ep', label: 'Emergency Procedures' },
  ];
  const [caTab, setCaTab] = useState('loft');

  const documentTabs = [
    { key: 'search', label: 'Search archive' },
    { key: 'bulk-import', label: 'Bulk import' },
  ];
  const [documentTab, setDocumentTab] = useState('search');

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Archived records (visible to HOTC / HOFO / Flight Ops Admin only)
      </div>
      <TabBar tabs={topTabs} active={topTab} onSelect={setTopTab} />

      {topTab === 'pilots' && (
        <div>
          <TabBar tabs={pilotTabs} active={pilotTab} onSelect={setPilotTab} />
          {pilotTab === 'loft' && <ArchivedFlights traineeType="PILOT" />}
          {pilotTab === 'ipc' && <ProficiencyChecks variant="IPC_PC" label="IPC" archived />}
          {pilotTab === 'pc' && <ProficiencyChecks variant="PC" label="Proficiency Check" archived />}
          {pilotTab === 'ep' && <EpChecks appliesTo="PILOT" archived />}
        </div>
      )}

      {topTab === 'cabin-attendants' && (
        <div>
          <TabBar tabs={caTabs} active={caTab} onSelect={setCaTab} />
          {caTab === 'loft' && <ArchivedFlights traineeType="CABIN_ATTENDANT" />}
          {caTab === 'ctl' && <ArchivedCheckToLine />}
          {caTab === 'linecheck' && <CaChecks archived />}
          {caTab === 'ep' && <EpChecks appliesTo="CABIN_ATTENDANT" archived />}
        </div>
      )}

      {topTab === 'specialist' && <ArchivedUpgrades />}

      {topTab === 'documents' && (
        <div>
          <TabBar tabs={documentTabs} active={documentTab} onSelect={setDocumentTab} />
          {documentTab === 'search' && <ArchivedDocuments />}
          {documentTab === 'bulk-import' && <BulkImportDocuments />}
        </div>
      )}

      {topTab === 'others' && <ArchivedTrainees />}
    </div>
  );
}
