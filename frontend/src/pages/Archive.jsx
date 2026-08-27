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
              {d.expiryDate ? ` · Expired ${formatDate(d.expiryDate)}` : ''}
              {d.archivedAt ? ` · Archived ${formatDate(d.archivedAt)}` : ''}
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); view(d); }}>View</button>
        </div>
      ))}
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

      {topTab === 'documents' && <ArchivedDocuments />}

      {topTab === 'others' && <ArchivedTrainees />}
    </div>
  );
}
