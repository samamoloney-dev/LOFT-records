import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { FlightRow, APPROACH_TYPES } from './FlightRow';
import { CtlForm } from './CtlForm';
import { SyllabusItemsList, PhaseCompletionPanel, CaSyllabusOverview } from './SyllabusPanel';
import { Phase4Form } from './Phase4Form';
import { GroundSchoolPanel } from './GroundSchoolPanel';
import { LandingAssessmentForm } from './LandingAssessmentForm';
import { ArchiveButton } from '../components/ArchiveButton';
import { formatFleet, formatTraineeRole } from '../lib/format';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

// Anyone who trains or checks trainees (pilot or cabin crew side) can log a
// flight - mirrors backend/src/middleware/roles.js FLIGHT_CREATOR_ROLES.
const FLIGHT_CREATOR_ROLES = [
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER',
  'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER',
];

// The Landing Assessment tab only applies to Fokker 100/Dash 8 pilot
// trainees (Metro 23 doesn't require it) - appended conditionally rather
// than being a fixed tab like the rest.
const LANDING_ASSESSMENT_FLEETS = ['FOKKER_100', 'DASH_8'];

function pilotTabs(fleet) {
  const tabs = [
    { key: 'groundSchool', label: 'Ground School' },
    { key: 'flights', label: 'Flights' },
    { key: 'syllabus', label: 'Syllabus' },
    { key: 'discussion', label: 'Line Training Discussion' },
    { key: 'phase4', label: 'Phase 4' },
    { key: 'phase', label: 'Phase Completion' },
    { key: 'ctl', label: 'Check to Line' },
  ];
  if (LANDING_ASSESSMENT_FLEETS.includes(fleet)) {
    tabs.push({ key: 'landingAssessment', label: 'Landing Assessment' });
  }
  return tabs;
}

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

function FlightsTab({ traineeId, trainee, flights, onFlightsChange, ctlCompleted }) {
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

  async function archivePackage() {
    setError(null);
    try { onFlightsChange(await api.post(`/api/flights/trainee/${traineeId}/archive-package`)); }
    catch (err) { setError(err.message); }
  }

  async function unarchivePackage() {
    setError(null);
    try { onFlightsChange(await api.post(`/api/flights/trainee/${traineeId}/unarchive-package`)); }
    catch (err) { setError(err.message); }
  }

  const totalHours = flights.reduce((sum, f) => sum + Number(f.hours), 0);
  const tally = approachTally(flights);
  const finalisedFlights = flights.filter((f) => f.locked);
  const packageArchived = finalisedFlights.length > 0 && finalisedFlights.every((f) => f.archived);

  // LOFT numbers count up chronologically (LOFT 1 = earliest flight),
  // independent of the display order (flights are listed newest first).
  const loftNumberById = new Map(
    [...flights]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((f, i) => [f.id, i + 1]),
  );

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 500 }}>Flights</div>
          <ArchiveButton
            archived={packageArchived}
            canArchive={ctlCompleted}
            onArchive={archivePackage}
            onUnarchive={unarchivePackage}
          />
        </div>
        {!ctlCompleted && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            This LOFT package can be archived as a whole once Check to Line is complete.
          </div>
        )}
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
          loftNumber={loftNumberById.get(f.id)}
          onChange={(updated) => onFlightsChange(flights.map((x) => (x.id === updated.id ? updated : x)))}
        />
      ))}
    </div>
  );
}

export function TraineeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trainee, setTrainee] = useState(null);
  const [flights, setFlights] = useState([]);
  const [ctlCompleted, setCtlCompleted] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('flights');
  const [promoting, setPromoting] = useState(false);
  const [promoted, setPromoted] = useState(false);

  function load() {
    api.get(`/api/trainees/${id}`).then(setTrainee).catch((e) => setError(e.message));
    api.get(`/api/flights?traineeId=${id}`).then(setFlights).catch(() => {});
    api.get(`/api/ctl/${id}`).then((d) => setCtlCompleted(!!d.form?.completedAt)).catch(() => {});
  }

  useEffect(load, [id]);

  async function addToCrewRoster() {
    setError(null);
    setPromoting(true);
    try {
      const crewMember = await api.post(`/api/trainees/${id}/promote-to-crew`);
      setPromoted(true);
      navigate(`/crew/${crewMember.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPromoting(false);
    }
  }

  if (error) return <div className="error-text">{error}</div>;
  if (!trainee) return <div>Loading…</div>;

  const isCabinAttendant = trainee.type === 'CABIN_ATTENDANT';
  const tabs = isCabinAttendant ? CA_TABS : pilotTabs(trainee.fleet);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{trainee.firstName} {trainee.lastName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {formatFleet(trainee.fleet)} · {formatTraineeRole(trainee.role)}
              {!isCabinAttendant && ` · Phase ${trainee.phase}`}
              {!isCabinAttendant && ` · ${trainee.totalHours}h total`}
              {trainee.archived && <span className="badge warn" style={{ marginLeft: 8 }}>Archived</span>}
            </div>
          </div>
          {ADMIN_ROLES.includes(user.role) && ctlCompleted && !promoted && (
            <button onClick={addToCrewRoster} disabled={promoting}>{promoting ? 'Adding…' : 'Add to Crew roster'}</button>
          )}
        </div>
        {ADMIN_ROLES.includes(user.role) && !ctlCompleted && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            Once Check to Line is complete, this trainee can be added to the ongoing Crew roster for recurrency tracking.
          </div>
        )}
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

      {tab === 'syllabus' && (isCabinAttendant ? <CaSyllabusOverview trainee={trainee} /> : <SyllabusItemsList trainee={trainee} section="SYLLABUS" />)}
      {tab === 'discussion' && <SyllabusItemsList trainee={trainee} section="DISCUSSION" />}
      {tab === 'groundSchool' && !isCabinAttendant && <GroundSchoolPanel trainee={trainee} />}
      {tab === 'flights' && <FlightsTab traineeId={id} trainee={trainee} flights={flights} onFlightsChange={setFlights} ctlCompleted={ctlCompleted} />}
      {tab === 'phase4' && !isCabinAttendant && <Phase4Form traineeId={id} />}
      {tab === 'phase' && !isCabinAttendant && <PhaseCompletionPanel trainee={trainee} onTraineeChange={load} />}
      {tab === 'ctl' && <CtlForm traineeId={id} traineeType={trainee.type} fleet={trainee.fleet} onCompleted={load} />}
      {tab === 'landingAssessment' && !isCabinAttendant && <LandingAssessmentForm traineeId={id} fleet={trainee.fleet} />}
    </div>
  );
}
