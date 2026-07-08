import { useAuth } from '../context/AuthContext';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// HOTC/HOFO/Flight Ops Admin only - permanently deletes a check record.
// Archived checks can't be deleted (they'd need unarchiving first), so the
// button simply doesn't render for them.
export function DeleteButton({ archived, onDelete }) {
  const { user } = useAuth();
  if (!ADMIN_ROLES.includes(user.role) || archived) return null;
  return (
    <button
      className="danger"
      onClick={() => {
        if (window.confirm('Permanently delete this check? This cannot be undone.')) onDelete();
      }}
    >Delete</button>
  );
}
