import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
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
import { formatUserRole } from './lib/format';
import { CONTINUOUS_IMPROVEMENT_ROLES } from './lib/roles';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];
const CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER', 'CA_CHECKER', 'SIMULATOR_ONLY'];

function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <div className="top-bar">
        <span className="brand">Flight Standards System</span>
        <span className="user-label">{user.name} · {formatUserRole(user.role)}</span>
      </div>
      <nav className="top-nav">
        <NavLink to="/" end>Trainees</NavLink>
        {CHECK_ROLES.includes(user.role) && <NavLink to="/checks">Checks</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/crew">Crew</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/currency">Currency Overview</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/planning">Planning</NavLink>}
        {CONTINUOUS_IMPROVEMENT_ROLES.includes(user.role) && <NavLink to="/continuous-improvement">Continuous Improvement</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/syllabus">Syllabus</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/archive">Archive</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/staff">Resources</NavLink>}
      </nav>
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
                <Route path="/trainees/:id" element={<TraineeDetail />} />
                <Route path="/syllabus" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN']}><SyllabusAdmin /></ProtectedRoute>} />
                <Route path="/archive" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN']}><Archive /></ProtectedRoute>} />
                <Route path="/staff" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN']}><Staff /></ProtectedRoute>} />
                <Route path="/checks" element={<Checks />} />
                <Route path="/crew" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN']}><Crew /></ProtectedRoute>} />
                <Route path="/crew/:id" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN']}><CrewDetail /></ProtectedRoute>} />
                <Route path="/currency" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN']}><CurrencyOverview /></ProtectedRoute>} />
                <Route path="/planning" element={<ProtectedRoute roles={['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN']}><Planning /></ProtectedRoute>} />
                <Route path="/continuous-improvement" element={<ProtectedRoute roles={CONTINUOUS_IMPROVEMENT_ROLES}><ContinuousImprovement /></ProtectedRoute>} />
              </Routes>
            </Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
