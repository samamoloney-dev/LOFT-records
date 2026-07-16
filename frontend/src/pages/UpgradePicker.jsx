import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { UpgradeRecordForm } from './UpgradeRecordForm';
import { UPGRADE_VARIANTS } from '../lib/roles';
import { formatFleet, formatTraineeRole } from '../lib/format';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// Candidate picker in front of UpgradeRecordForm - a line Captain/Cabin
// Attendant being upgraded to Training/Check Captain or Training/Check
// Cabin Attendant. Scoped to the logged-in checker's own fleet(s) ("for
// their relevant fleet", per the operator's explicit request) - admins see
// every candidate of the matching crew type regardless of fleet.
export function UpgradePicker({ variant }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const variantConfig = UPGRADE_VARIANTS[variant];
  const [crew, setCrew] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/crew?type=${variantConfig.crewType}`).then(setCrew).catch((e) => setError(e.message));
  }
  useEffect(load, [variant]);

  // Training/Check Captain upgrades only apply to Captains, not First
  // Officers - a Captain must be held first (crew.role is the only signal
  // for this, since CABIN_ATTENDANT has just the one role either way).
  const eligible = crew
    .filter((c) => variantConfig.crewType !== 'PILOT' || c.role === 'CAPTAIN')
    .filter((c) => isAdmin || (c.fleets || []).some((f) => (user.fleets || []).includes(f)));
  const selected = eligible.find((c) => c.id === selectedId);

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontWeight: 500 }}>{selected.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {(selected.fleets || []).map(formatFleet).join(', ')} · {formatTraineeRole(selected.role)}
          </div>
        </div>
        <UpgradeRecordForm
          variant={variant} crewMemberId={selected.id} crewMemberName={selected.name}
          fleet={selected.fleets?.[0]} crewIsLinked={selected.isLinked}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Select a {variantConfig.crewType === 'PILOT' ? 'line Captain' : 'Cabin Attendant'} to view or start their {variantConfig.label}.
      </div>
      {error && <div className="error-text">{error}</div>}
      {eligible.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No eligible crew found.</div>}
      {eligible.map((c) => (
        <div key={c.id} className="card row" onClick={() => setSelectedId(c.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(c.fleets || []).map(formatFleet).join(', ')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
