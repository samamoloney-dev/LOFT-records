import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet } from '../lib/format';
import { EpChecks } from './EpChecks';
import { CaChecks } from './CaChecks';
import { ProficiencyChecks } from './ProficiencyChecks';
import { ArchivedFlights } from './ArchivedFlights';
import { ArchivedCheckToLine } from './ArchivedCheckToLine';

function TabBar({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '0.5px solid var(--border)', flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          style={{ border: 'none', background: 'none', padding: '7px 14px', borderBottom: active === t.key ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: active === t.key ? 500 : 400 }}
        >{t.label}</button>
      ))}
    </div>
  );
}

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

export function Archive() {
  const topTabs = [
    { key: 'pilots', label: 'Pilots' },
    { key: 'cabin-attendants', label: 'Cabin Attendants' },
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

      {topTab === 'others' && <ArchivedTrainees />}
    </div>
  );
}
