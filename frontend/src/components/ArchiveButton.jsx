import { useAuth } from '../context/AuthContext';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

// HOTC/HOFO/Flight Ops Admin only - lets them move a completed check/flight/
// CTL record into the Archive section, or bring it back.
export function ArchiveButton({ archived, canArchive, onArchive, onUnarchive }) {
  const { user } = useAuth();
  if (!ADMIN_ROLES.includes(user.role)) return null;

  if (archived) {
    return <button onClick={onUnarchive}>Unarchive</button>;
  }
  if (!canArchive) return null;
  return <button className="primary" onClick={onArchive}>Archive</button>;
}
