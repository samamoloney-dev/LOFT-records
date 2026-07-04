import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDate, formatFleet } from '../lib/format';
import { CtlForm } from './CtlForm';

// Browses archived Check to Line forms across all cabin attendant trainees.
export function ArchivedCheckToLine() {
  const [forms, setForms] = useState([]);
  const [selectedTraineeId, setSelectedTraineeId] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/ctl?archived=true').then(setForms).catch((e) => setError(e.message));
  }
  useEffect(load, []);

  const selected = forms.find((f) => f.traineeId === selectedTraineeId);

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelectedTraineeId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontWeight: 500 }}>{selected.firstName} {selected.lastName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatFleet(selected.traineeFleet)}</div>
        </div>
        <CtlForm traineeId={selected.traineeId} traineeType="CABIN_ATTENDANT" fleet={selected.traineeFleet} onCompleted={() => { setSelectedTraineeId(null); load(); }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Archived Check to Line forms</div>
      {error && <div className="error-text">{error}</div>}
      {forms.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No archived Check to Line forms.</div>}
      {forms.map((f) => (
        <div key={f.traineeId} className="card row" onClick={() => setSelectedTraineeId(f.traineeId)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{f.firstName} {f.lastName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatFleet(f.traineeFleet)} · Completed {f.completedAt ? formatDate(f.completedAt) : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
