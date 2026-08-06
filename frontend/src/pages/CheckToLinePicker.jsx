import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CtlForm } from './CtlForm';
import { formatFleet } from '../lib/format';

// Check to Line is tied to one trainee at a time (it archives them on
// completion), unlike the flat check lists elsewhere in this tab - so this
// is a trainee picker in front of the same CtlForm used on the trainee page.
// traineeType scopes the picker to one trainee type at a time (Checks tab
// wires up one instance per Pilots/Cabin Attendants top tab) - a pilot and
// a cabin attendant Check to Line are different forms (see CtlForm.jsx).
export function CheckToLinePicker({ traineeType = 'CABIN_ATTENDANT' }) {
  const [trainees, setTrainees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const typeLabel = traineeType === 'PILOT' ? 'pilot' : 'cabin attendant';

  function load() {
    api.get('/api/trainees')
      .then((all) => setTrainees(all.filter((t) => t.type === traineeType)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [traineeType]);

  const selected = trainees.find((t) => t.id === selectedId);

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontWeight: 500 }}>{selected.firstName} {selected.lastName}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatFleet(selected.fleet)}</div>
        </div>
        <CtlForm traineeId={selected.id} traineeType={traineeType} fleet={selected.fleet} onCompleted={() => { setSelectedId(null); load(); }} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Select a {typeLabel} trainee to view or complete their Check to Line form.
      </div>
      {error && <div className="error-text">{error}</div>}
      {trainees.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No {typeLabel} trainees found.</div>}
      {trainees.map((t) => (
        <div key={t.id} className="card row" onClick={() => setSelectedId(t.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{t.firstName} {t.lastName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatFleet(t.fleet)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
