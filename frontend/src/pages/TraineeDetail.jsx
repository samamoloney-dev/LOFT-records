import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { FlightRow, APPROACH_TYPES } from './FlightRow';
import { CtlForm } from './CtlForm';
import { SyllabusItemsList, PhaseCompletionPanel } from './SyllabusPanel';

// Anyone who trains or checks trainees (pilot or cabin crew side) can log a
// flight - mirrors backend/src/middleware/roles.js FLIGHT_CREATOR_ROLES.
const FLIGHT_CREATOR_ROLES = [
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER',
  'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER',
];

const PILOT_TABS = [
  { key: 'flights', label: 'Flights' },
  { key: 'syllabus', label: 'Syllabus' },
  { key: 'discussion', label: 'Line Training Discussion' },
  { key: 'phase', label: 'Phase Completion' },
  { key: 'ctl', label: 'Check to Line' },
];

// Cabin attendants have no phase concept - the syllabus is signed off
// cumulatively across training flights rather than gated by phase.
const CA_TABS = [
  { key: 'flights', label: 'Flights' },
  { key: 'syllabus', label: 'Syllabus' },
  { key: 'discussion', label: 'Line Training Discussion' },
  { key: 'ctl', label: 'Check to Line' },
];

function approachTally(flights) {
  const counts = Object.fromEntries(APPROACH_TYPES.map((t) => [t, 0]));
  for (const f of flights) {
    for (const a of f.sectorDetails?.approaches || []) {
      if (a.type && counts[a.type] !== undefined) counts[a.type] += 1;
    }
  }
  return counts;
}

function FlightsTab({ traineeId, trainee, flights, onFlightsChange }) {
  const { user } = useAuth();
  const [error, setError] = useState(null);
  const [newFlightDate, setNewFlightDate] = useState('');
  const [newFlightHours, setNewFlightHours] = useState('');
  const canCreateFlight = FLIGHT_CREATOR_ROLES.includes(user.role);
  const isCabinAttendant = trainee.type === 'CABIN_ATTENDANT';

  async function createFlight(e) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.post('/api/flights', { traineeId, date: newFlightDate, hours: Number(newFlightHours) || 0 });
      setNewFlightDate('');
      setNewFlightHours('');
      onFlightsChange([created, ...flights]);
    } catch (err) { setError(err.message); }
  }

  const totalHours = flights.reduce((sum, f) => sum + Number(f.hours), 0);
  const tally = approachTally(flights);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 500 }}>Flights</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
          {isCabinAttendant
            ? `${flights.length} flight${flights.length === 1 ? '' : 's'}`
            : `${flights.length} flight${flights.length === 1 ? '' : 's'} · ${totalHours.toFixed(1)}h total`}
        </div>
        {!isCabinAttendant && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {APPROACH_TYPES.map((t) => (
              <span key={t} className="badge" style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}>
                {t}: {tally[t]}
              </span>
            ))}
          </div>
        )}
        {canCreateFlight && (
          <form onSubmit={createFlight} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label>Date</label>
              <input type="date" value={newFlightDate} onChange={(e) => setNewFlightDate(e.target.value)} required />
            </div>
            {!isCabinAttendant && (
              <div className="field" style={{ margin: 0, width: 100 }}>
                <label>Hours</label>
                <input type="number" step="0.1" value={newFlightHours} onChange={(e) => setNewFlightHours(e.target.value)} required />
              </div>
            )}
            <button type="submit" className="primary">Add flight</button>
          </form>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>
      {flights.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No flights recorded yet.</div>}
      {flights.map((f) => (
        <FlightRow
          key={f.id}
          flight={f}
          trainee={trainee}
          onChange={(updated) => onFlightsChange(flights.map((x) => (x.id === updated.id ? updated : x)))}
        />
      ))}
    </div>
  );
}

export function TraineeDetail() {
  const { id } = useParams();
  const [trainee, setTrainee] = useState(null);
  const [flights, setFlights] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('flights');

  function load() {
    api.get(`/api/trainees/${id}`).then(setTrainee).catch((e) => setError(e.message));
    api.get(`/api/flights?traineeId=${id}`).then(setFlights).catch(() => {});
  }

  useEffect(load, [id]);

  if (error) return <div className="error-text">{error}</div>;
  if (!trainee) return <div>Loading…</div>;

  const isCabinAttendant = trainee.type === 'CABIN_ATTENDANT';
  const tabs = isCabinAttendant ? CA_TABS : PILOT_TABS;

  return (
    <div>
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 600 }}>{trainee.firstName} {trainee.lastName}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {trainee.fleet} · {trainee.role}
          {!isCabinAttendant && ` · Phase ${trainee.phase}`}
          {!isCabinAttendant && ` · ${trainee.totalHours}h total`}
          {trainee.archived && <span className="badge warn" style={{ marginLeft: 8 }}>Archived</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '0.5px solid var(--border)', flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ border: 'none', background: 'none', padding: '7px 14px', borderBottom: tab === t.key ? '2px solid var(--text-primary)' : '2px solid transparent', fontWeight: tab === t.key ? 500 : 400 }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'syllabus' && <SyllabusItemsList trainee={trainee} section="SYLLABUS" />}
      {tab === 'discussion' && <SyllabusItemsList trainee={trainee} section="DISCUSSION" />}
      {tab === 'flights' && <FlightsTab traineeId={id} trainee={trainee} flights={flights} onFlightsChange={setFlights} />}
      {tab === 'phase' && !isCabinAttendant && <PhaseCompletionPanel trainee={trainee} onTraineeChange={load} />}
      {tab === 'ctl' && <CtlForm traineeId={id} traineeType={trainee.type} onCompleted={load} />}
    </div>
  );
}
