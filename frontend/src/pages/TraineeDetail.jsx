import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { FlightRow } from './FlightRow';
import { CtlForm } from './CtlForm';
import { SyllabusPanel } from './SyllabusPanel';

// Anyone who trains or checks trainees (pilot or cabin crew side) can log a
// flight - mirrors backend/src/middleware/roles.js FLIGHT_CREATOR_ROLES.
const FLIGHT_CREATOR_ROLES = [
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER',
  'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER',
];

export function TraineeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [trainee, setTrainee] = useState(null);
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState(null);
  const [newFlightDate, setNewFlightDate] = useState('');
  const [newFlightHours, setNewFlightHours] = useState('');

  function load() {
    api.get(`/api/trainees/${id}`).then(setTrainee).catch((e) => setError(e.message));
    api.get(`/api/flights?traineeId=${id}`).then(setFlights).catch(() => {});
  }

  useEffect(load, [id]);

  async function createFlight(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/flights', { traineeId: id, date: newFlightDate, hours: Number(newFlightHours) || 0 });
      setNewFlightDate('');
      setNewFlightHours('');
      load();
    } catch (err) { setError(err.message); }
  }

  if (error) return <div className="error-text">{error}</div>;
  if (!trainee) return <div>Loading…</div>;

  const canCreateFlight = FLIGHT_CREATOR_ROLES.includes(user.role);

  return (
    <div>
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 600 }}>{trainee.firstName} {trainee.lastName}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {trainee.fleet} · {trainee.role} · Phase {trainee.phase} · {trainee.totalHours}h total
          {trainee.archived && <span className="badge warn" style={{ marginLeft: 8 }}>Archived</span>}
        </div>
      </div>

      <SyllabusPanel trainee={trainee} onTraineeChange={load} />

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 500 }}>Flights</div>
        </div>
        {canCreateFlight && (
          <form onSubmit={createFlight} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>Date</label>
              <input type="date" value={newFlightDate} onChange={(e) => setNewFlightDate(e.target.value)} required />
            </div>
            <div className="field" style={{ margin: 0, width: 100 }}>
              <label>Hours</label>
              <input type="number" step="0.1" value={newFlightHours} onChange={(e) => setNewFlightHours(e.target.value)} required />
            </div>
            <button type="submit" className="primary">Add flight</button>
          </form>
        )}
        {flights.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No flights recorded yet.</div>}
        {flights.map((f) => (
          <FlightRow key={f.id} flight={f} onChange={(updated) => setFlights((fs) => fs.map((x) => (x.id === updated.id ? updated : x)))} />
        ))}
        {error && <div className="error-text">{error}</div>}
      </div>

      <CtlForm traineeId={id} onCompleted={load} />
    </div>
  );
}
