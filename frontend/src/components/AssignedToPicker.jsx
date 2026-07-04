import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

// HOTC/HOFO/Flight Ops Admin only - lets them pick which staff member is
// responsible for a check. Selecting someone hands back their record so the
// caller can prefill the rest of the form (name, ARN, etc).
export function AssignedToPicker({ value, eligibleRoles, onAssign }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/api/users').then(setStaff).catch(() => {});
  }, [isAdmin]);

  if (!isAdmin) return null;

  const eligible = staff.filter((s) => eligibleRoles.includes(s.role));

  return (
    <div className="field">
      <label>Assign to</label>
      <select
        value={value || ''}
        onChange={(e) => onAssign(eligible.find((s) => s.id === e.target.value) || null)}
      >
        <option value="">— Unassigned —</option>
        {eligible.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
      </select>
    </div>
  );
}
