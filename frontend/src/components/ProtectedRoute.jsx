import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// `allow` is an optional predicate(user) => boolean for gating that isn't
// a plain role list (e.g. Certificate Generator's canAccessCertificates,
// which also admits anyone individually ticked for a checkAccess flag,
// not just a fixed set of roles) - takes priority over `roles` when given,
// rather than combining the two, so a route's access rule only ever lives
// in one place.
export function ProtectedRoute({ roles, allow, children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow(user)) return <Navigate to="/" replace />;
  if (!allow && roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return children;
}
