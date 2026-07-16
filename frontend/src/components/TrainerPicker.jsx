import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { TRAINER_ROLES } from '../lib/roles';
import { formatUserRole } from '../lib/format';

// HOTC/HOFO/Alternate can sign off any trainee's syllabus item regardless
// of fleet, same as everywhere else in the app - everyone else on
// TRAINER_ROLES needs a matching fleet tick, since a different FS pilot
// may run each phase/item and this must actually reflect who did it.
const ALWAYS_ELIGIBLE_ROLES = ['HOTC', 'HOFO', 'ALTERNATE'];

// Lets a syllabus/discussion/flight item be signed off in the name of
// whichever trainer actually conducted it, instead of always being
// whoever happens to be logged in - see syllabus.js's resolveSignedOffBy,
// which resolves the name server-side from the picked staff id.
export function TrainerPicker({ value, fleet, onSelect, disabled }) {
  const [staff, setStaff] = useState([]);
  useEffect(() => { api.get('/api/users/roster').then(setStaff).catch(() => {}); }, []);

  const eligible = staff.filter((s) => (
    TRAINER_ROLES.includes(s.role)
    && (ALWAYS_ELIGIBLE_ROLES.includes(s.role) || !fleet || (s.fleets || []).includes(fleet))
  ));

  return (
    <select
      style={{ maxWidth: 220 }}
      disabled={disabled}
      value={value || ''}
      onChange={(e) => onSelect(e.target.value || null)}
    >
      <option value="">Signed off by...</option>
      {eligible.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatUserRole(s.role)})</option>)}
    </select>
  );
}
