import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatFleet } from '../lib/format';
import { CaptainInTrainingForm } from './CaptainInTrainingForm';
import { TabBar } from '../components/TabBar';

const VARIANT_TABS = [
  { key: 'PRELIMINARY', label: 'CIT Preliminary' },
  { key: 'FINAL', label: 'CIT Final' },
];

// Captain in Training assessments are tied to one pilot at a time - this is
// a pilot picker in front of the same CaptainInTrainingForm used on the
// crew member's own profile, mirroring CheckToLinePicker's pattern.
export function CaptainInTrainingPicker() {
  const [pilots, setPilots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [variant, setVariant] = useState('PRELIMINARY');
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/crew?type=PILOT').then(setPilots).catch((e) => setError(e.message));
  }, []);

  const selected = pilots.find((p) => p.id === selectedId);

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontWeight: 500 }}>{selected.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(selected.fleets || []).map(formatFleet).join(', ')}</div>
        </div>
        <TabBar tabs={VARIANT_TABS} active={variant} onSelect={setVariant} />
        <CaptainInTrainingForm variant={variant} crewMemberId={selected.id} crewMemberName={selected.name} fleet={selected.fleets?.[0]} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Select a pilot to view or complete their Captain in Training assessments.
      </div>
      {error && <div className="error-text">{error}</div>}
      {pilots.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No pilots found.</div>}
      {pilots.map((p) => (
        <div key={p.id} className="card row" onClick={() => setSelectedId(p.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(p.fleets || []).map(formatFleet).join(', ')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
