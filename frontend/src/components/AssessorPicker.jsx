import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { isEligibleForCheck } from '../lib/checkAccess';
import { formatUserRole } from '../lib/format';

// Available to whoever is filling out the check (not admin-only) - lets them
// pick the assessor from the roster of staff approved for that check type
// (ticked on their staff profile), instead of typing a name by hand.
// Prefills the ARN from that person's staff profile.
export function AssessorPicker({ value, accessType, fleet, onSelect, label = 'Assessor', disabled }) {
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    api.get('/api/users/roster').then(setStaff).catch(() => {});
  }, []);

  const eligible = staff.filter((s) => isEligibleForCheck(s, accessType, fleet));

  return (
    <div className="field">
      <label>{label}</label>
      <select
        disabled={disabled}
        value={value || ''}
        onChange={(e) => onSelect(eligible.find((s) => s.id === e.target.value) || null)}
      >
        <option value="">—</option>
        {eligible.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatUserRole(s.role)})</option>)}
      </select>
    </div>
  );
}
