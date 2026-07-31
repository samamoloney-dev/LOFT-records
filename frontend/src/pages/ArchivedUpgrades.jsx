import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatFleet } from '../lib/format';
import { UpgradeRecordForm } from './UpgradeRecordForm';
import { UPGRADE_VARIANTS } from '../lib/roles';
import { TabBar } from '../components/TabBar';

const UPGRADE_TABS = Object.entries(UPGRADE_VARIANTS).map(([key, cfg]) => ({ key, label: cfg.label.replace(' Upgrade', '') }));

// Archived Training/Check Captain and Training/Check Cabin Attendant
// Upgrade Records, browsable across every candidate - the live Staff >
// Upgrades tab (UpgradePicker) only ever lists in-progress records, so once
// one was archived there was previously nowhere left in the app to find it
// again.
function ArchivedUpgradesPanel({ variant }) {
  const variantConfig = UPGRADE_VARIANTS[variant];
  const [crew, setCrew] = useState([]);
  const [checks, setChecks] = useState([]);
  const [selectedCrewMemberId, setSelectedCrewMemberId] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/crew?type=${variantConfig.crewType}`).then(setCrew).catch((e) => setError(e.message));
    api.get('/api/checks?checkType=UPGRADE_RECORD&archived=true').then(setChecks).catch((e) => setError(e.message));
  }
  useEffect(load, [variant]);
  useEffect(() => setSelectedCrewMemberId(null), [variant]);

  const variantChecks = checks.filter((c) => c.details?.variant === variant);
  const crewById = new Map(crew.map((c) => [c.id, c]));
  const selectedCheck = variantChecks.find((c) => c.crewMemberId === selectedCrewMemberId);
  const selectedCrew = selectedCheck ? crewById.get(selectedCheck.crewMemberId) : null;

  if (selectedCheck) {
    return (
      <div>
        <button onClick={() => setSelectedCrewMemberId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontWeight: 500 }}>{selectedCheck.crewMemberName}</div>
          {selectedCrew && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {(selectedCrew.fleets || []).map(formatFleet).join(', ')}
            </div>
          )}
        </div>
        <UpgradeRecordForm
          variant={variant}
          crewMemberId={selectedCheck.crewMemberId}
          crewMemberName={selectedCheck.crewMemberName}
          fleet={selectedCrew?.fleets?.[0]}
          crewIsLinked={selectedCrew?.isLinked}
          archived
        />
      </div>
    );
  }

  return (
    <div>
      {error && <div className="error-text">{error}</div>}
      {variantChecks.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          No archived {variantConfig.label.toLowerCase()} records.
        </div>
      )}
      {variantChecks.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedCrewMemberId(c.crewMemberId)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.crewMemberName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.completedAt ? 'Completed' : 'In progress'}</div>
          </div>
          {c.result && <span className={`badge ${c.result === 'PASS' ? 'pass' : 'fail'}`}>{c.result}</span>}
        </div>
      ))}
    </div>
  );
}

export function ArchivedUpgrades() {
  const [variant, setVariant] = useState(UPGRADE_TABS[0].key);
  return (
    <div>
      <TabBar tabs={UPGRADE_TABS} active={variant} onSelect={setVariant} />
      <ArchivedUpgradesPanel variant={variant} />
    </div>
  );
}
