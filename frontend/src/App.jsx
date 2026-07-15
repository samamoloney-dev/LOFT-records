import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { api } from './api/client';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Trainees } from './pages/Trainees';
import { TraineeDetail } from './pages/TraineeDetail';
import { Archive } from './pages/Archive';
import { Staff } from './pages/Staff';
import { Checks } from './pages/Checks';
import { Crew } from './pages/Crew';
import { CrewDetail } from './pages/CrewDetail';
import { CurrencyOverview } from './pages/CurrencyOverview';
import { Planning } from './pages/Planning';
import { SyllabusAdmin, ContentApprovalAlert } from './pages/SyllabusAdmin';
import { CaptainInTrainingPicker } from './pages/CaptainInTrainingPicker';
import { ContinuousImprovement } from './pages/ContinuousImprovement';
import { MeetingMinutesList, MeetingMinutesDetail, MeetingMinutesAlert } from './pages/MeetingMinutes';
import { formatUserRole } from './lib/format';
import { CONTINUOUS_IMPROVEMENT_ROLES } from './lib/roles';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
// Flight Ops Admin excluded - they cannot conduct any checking, so the
// Checks tab has nothing for them to do. Cabin Attendant Manager is
// included - they check Cabin Attendant Line Checks and Emergency
// Procedures for all pilots and cabin crew (see checks.js canAccessCheckType).
const CHECK_ROLES = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER', 'CA_CHECKER', 'CA_MANAGER', 'SIMULATOR_ONLY'];
// Every staff role - meeting minutes is for the whole operation, trainees
// (who have their own restricted self-login view) excepted.
const NON_TRAINEE_ROLES = [
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE', 'EXAMINER',
  'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CA_MANAGER', 'GROUND_INSTRUCTOR', 'CC', 'SIMULATOR_ONLY',
];
// Cabin Attendant Manager gets Crew tab access too, but scoped to cabin
// attendant records only (see crew.js forbiddenForCaManager) and Syllabus
// Admin access scoped to cabin attendant fleets (see syllabus.js/
// ground-school.js approval-queue gating for non-HOTC editors).
const CREW_VISIBLE_ROLES = [...ADMIN_ROLES, 'CA_MANAGER'];
const SYLLABUS_ADMIN_ROLES = [...ADMIN_ROLES, 'CA_MANAGER'];
// Captain in Training assessments live alongside LOFT Trainees rather than
// under Checks - same roles who could actually complete one before (HOTC/
// HOFO/Alternate/Examiner - the only roles canAccessCheckType lets through
// for CAPTAIN_IN_TRAINING, see backend checks.js).
const CIT_ROLES = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER'];

// A red count badge on the Checks nav tab - "an IPC/PC/EP/Line Check/Check
// to Line just finished, go update the crew's records" (see checks.js
// GET /alerts/count and Checks.jsx's own "Mark reviewed" banner, which
// clears it).
function ChecksAlertBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!CHECK_ROLES.includes(user.role)) return;
    api.get('/api/checks/alerts/count').then((d) => setCount(d.count)).catch(() => {});
  }, [user.role]);

  if (count === 0) return null;
  return (
    <span
      style={{
        display: 'inline-block', marginLeft: 5, minWidth: 16, height: 16, borderRadius: 8,
        background: '#c0392b', color: '#fff', fontSize: 10, fontWeight: 700,
        textAlign: 'center', lineHeight: '16px', padding: '0 4px',
      }}
    >{count}</span>
  );
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <div className="top-bar">
        <span className="brand">Flight Standards System</span>
        <span className="user-label">{user.name} · {formatUserRole(user.role)}</span>
      </div>
      <nav className="top-nav">
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/" end>Home</NavLink>}
        <NavLink to="/trainees">LOFT Trainees</NavLink>
        {CIT_ROLES.includes(user.role) && <NavLink to="/captain-in-training">Captain in Training</NavLink>}
        {CREW_VISIBLE_ROLES.includes(user.role) && <NavLink to="/crew">Crew</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/currency">Currency Overview</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/planning">Planning</NavLink>}
        {CHECK_ROLES.includes(user.role) && <NavLink to="/checks">Checks<ChecksAlertBadge /></NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/staff">Resources</NavLink>}
        {CONTINUOUS_IMPROVEMENT_ROLES.includes(user.role) && <NavLink to="/continuous-improvement">Continuous Improvement</NavLink>}
        {SYLLABUS_ADMIN_ROLES.includes(user.role) && <NavLink to="/syllabus">Syllabus</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/archive">Archive</NavLink>}
        {user.role !== 'TRAINEE' && <NavLink to="/meeting-minutes">Meeting Minutes</NavLink>}
      </nav>
      {user.role !== 'TRAINEE' && <MeetingMinutesAlert />}
      {user.role !== 'TRAINEE' && <ContentApprovalAlert />}
      {children}
      <div style={{ textAlign: 'center', marginTop: '2rem', paddingTop: '1rem', borderTop: '0.5px solid var(--border)' }}>
        <button onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}

function Home() {
  const { user } = useAuth();
  if (user.role === 'TRAINEE' && user.traineeId) {
    return <Navigate to={`/trainees/${user.traineeId}`} replace />;
  }
  // The Home Dashboard is an operations view for HOTC/HOFO/Flight Ops
  // Admin/Alternate only - every other role keeps landing on the flat
  // trainee list, same as before this existed.
  return ADMIN_ROLES.includes(user.role) ? <Dashboard /> : <Trainees />;
}

// Mirrors Home()'s own TRAINEE-redirect guard so a trainee can't reach the
// full roster by navigating to /trainees directly.
function TraineesPage() {
  const { user } = useAuth();
  if (user.role === 'TRAINEE' && user.traineeId) {
    return <Navigate to={`/trainees/${user.traineeId}`} replace />;
  }
  return <Trainees />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Shell>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/trainees" element={<TraineesPage />} />
                <Route path="/trainees/:id" element={<TraineeDetail />} />
                <Route path="/captain-in-training" element={<ProtectedRoute roles={CIT_ROLES}><CaptainInTrainingPicker /></ProtectedRoute>} />
                <Route path="/syllabus" element={<ProtectedRoute roles={SYLLABUS_ADMIN_ROLES}><SyllabusAdmin /></ProtectedRoute>} />
                <Route path="/archive" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><Archive /></ProtectedRoute>} />
                <Route path="/staff" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><Staff /></ProtectedRoute>} />
                <Route path="/checks" element={<Checks />} />
                <Route path="/crew" element={<ProtectedRoute roles={CREW_VISIBLE_ROLES}><Crew /></ProtectedRoute>} />
                <Route path="/crew/:id" element={<ProtectedRoute roles={CREW_VISIBLE_ROLES}><CrewDetail /></ProtectedRoute>} />
                <Route path="/currency" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><CurrencyOverview /></ProtectedRoute>} />
                <Route path="/planning" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><Planning /></ProtectedRoute>} />
                <Route path="/continuous-improvement" element={<ProtectedRoute roles={CONTINUOUS_IMPROVEMENT_ROLES}><ContinuousImprovement /></ProtectedRoute>} />
                <Route path="/meeting-minutes" element={<ProtectedRoute roles={NON_TRAINEE_ROLES}><MeetingMinutesList /></ProtectedRoute>} />
                <Route path="/meeting-minutes/:id" element={<ProtectedRoute roles={NON_TRAINEE_ROLES}><MeetingMinutesDetail /></ProtectedRoute>} />
              </Routes>
            </Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
