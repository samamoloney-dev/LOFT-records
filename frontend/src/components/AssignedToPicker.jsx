import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ADMIN_ROLES, isEligibleForCheck } from '../lib/checkAccess';
import { formatUserRole } from '../lib/format';

// HOTC/HOFO/Flight Ops Admin only - lets them pick which staff member is
// responsible for a check, scoped to staff who have that check type ticked
// on their profile (or who are admins themselves). Selecting someone hands
// back their record so the caller can prefill the rest of the form.
export function AssignedToPicker({ value, accessType, fleet, onAssign }) {
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/api/users').then(setStaff).catch(() => {});
  }, [isAdmin]);

  if (!isAdmin) return null;

  const eligible = staff.filter((s) => isEligibleForCheck(s, accessType, fleet));

  return (
    <div className="field">
      <label>Assign to</label>
      <select
        value={value || ''}
        onChange={(e) => onAssign(eligible.find((s) => s.id === e.target.value) || null)}
      >
        <option value="">— Unassigned —</option>
        {eligible.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatUserRole(s.role)})</option>)}
      </select>
    </div>
  );
}
