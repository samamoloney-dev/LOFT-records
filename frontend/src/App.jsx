import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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
import { SyllabusAdmin } from './pages/SyllabusAdmin';
import { ContinuousImprovement } from './pages/ContinuousImprovement';
import { MeetingMinutesList, MeetingMinutesDetail, MeetingMinutesAlert } from './pages/MeetingMinutes';
import { formatUserRole } from './lib/format';
import { CONTINUOUS_IMPROVEMENT_ROLES } from './lib/roles';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
// Flight Ops Admin excluded - they cannot conduct any checking, so the
// Checks tab has nothing for them to do.
const CHECK_ROLES = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER', 'CA_CHECKER', 'SIMULATOR_ONLY'];
// Every staff role - meeting minutes is for the whole operation, trainees
// (who have their own restricted self-login view) excepted.
const NON_TRAINEE_ROLES = [
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE', 'EXAMINER',
  'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CC', 'SIMULATOR_ONLY',
];

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
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/crew">Crew</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/currency">Currency Overview</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/planning">Planning</NavLink>}
        {CHECK_ROLES.includes(user.role) && <NavLink to="/checks">Checks</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/staff">Resources</NavLink>}
        {CONTINUOUS_IMPROVEMENT_ROLES.includes(user.role) && <NavLink to="/continuous-improvement">Continuous Improvement</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/syllabus">Syllabus</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/archive">Archive</NavLink>}
        {user.role !== 'TRAINEE' && <NavLink to="/meeting-minutes">Meeting Minutes</NavLink>}
      </nav>
      {user.role !== 'TRAINEE' && <MeetingMinutesAlert />}
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
                <Route path="/syllabus" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><SyllabusAdmin /></ProtectedRoute>} />
                <Route path="/archive" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><Archive /></ProtectedRoute>} />
                <Route path="/staff" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><Staff /></ProtectedRoute>} />
                <Route path="/checks" element={<Checks />} />
                <Route path="/crew" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><Crew /></ProtectedRoute>} />
                <Route path="/crew/:id" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE']}><CrewDetail /></ProtectedRoute>} />
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
