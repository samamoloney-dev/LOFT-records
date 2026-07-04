import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatDate } from '../lib/format';
import { ArchiveButton } from '../components/ArchiveButton';

// Browses archived LOFT flight records across all trainees of one type
// (pilot or cabin attendant) - the per-trainee flight list only ever shows
// that trainee's own flights, so this is a new, flatter view.
export function ArchivedFlights({ traineeType }) {
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get('/api/flights?archived=true')
      .then((all) => setFlights(all.filter((f) => f.traineeType === traineeType)))
      .catch((e) => setError(e.message));
  }
  useEffect(load, [traineeType]);

  async function unarchive(flight) {
    setError(null);
    try { await api.post(`/api/flights/${flight.id}/unarchive`); load(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Archived LOFT records</div>
      {error && <div className="error-text">{error}</div>}
      {flights.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No archived LOFT records.</div>}
      {flights.map((f) => (
        <div key={f.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 500 }}>{f.firstName} {f.lastName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {formatDate(f.date)}{f.traineeType !== 'CABIN_ATTENDANT' && ` · ${Number(f.hours)}h`}
                {f.trainingCaptainName ? ` · Trainer: ${f.trainingCaptainName}` : ''}
              </div>
              {f.loftPerformanceRating && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Rating: {f.loftPerformanceRating}</div>}
              {f.debriefComments && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{f.debriefComments}</div>}
            </div>
            <ArchiveButton archived onUnarchive={() => unarchive(f)} />
          </div>
        </div>
      ))}
    </div>
  );
}
