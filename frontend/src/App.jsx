import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Trainees } from './pages/Trainees';
import { TraineeDetail } from './pages/TraineeDetail';
import { Archive } from './pages/Archive';
import { Staff } from './pages/Staff';
import { Checks } from './pages/Checks';
import { SyllabusAdmin } from './pages/SyllabusAdmin';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];
const CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER', 'CA_CHECKER'];

function Shell({ children }) {
  const { user, logout } = useAuth();
  return (
    <div className="app-shell">
      <nav className="top-nav">
        <span className="brand">Flight Standards System</span>
        <NavLink to="/" end>Trainees</NavLink>
        {CHECK_ROLES.includes(user.role) && <NavLink to="/checks">Checks</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/syllabus">Syllabus</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/archive">Archive</NavLink>}
        {ADMIN_ROLES.includes(user.role) && <NavLink to="/staff">Staff</NavLink>}
        <span className="spacer" />
        <span className="user-label">{user.name} · {user.role}</span>
        <button onClick={logout}>Sign out</button>
      </nav>
      {children}
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
              </Routes>
            </Shell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
