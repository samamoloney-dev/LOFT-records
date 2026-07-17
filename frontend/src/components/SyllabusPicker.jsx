import { useEffect, useState } from 'react';
import { api } from '../api/client';

// A named alternate syllabus for a fleet (e.g. "Direct Entry Captain" on
// the Metro) - value '' always means the fleet's standard syllabus (no
// row in training_syllabi represents that, it's implicit whenever
// syllabus_id is NULL - see syllabi.js). Re-fetches whenever the fleet
// changes since the list is fleet-scoped.
export function SyllabusPicker({ fleet, value, onChange, label = 'Syllabus', includeArchived = false }) {
  const [syllabi, setSyllabi] = useState([]);

  useEffect(() => {
    if (!fleet) { setSyllabi([]); return; }
    api.get(`/api/syllabi?fleet=${fleet}${includeArchived ? '&includeArchived=true' : ''}`).then(setSyllabi).catch(() => {});
  }, [fleet, includeArchived]);

  return (
    <div className="field">
      <label>{label}</label>
      <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Standard</option>
        {syllabi.map((s) => <option key={s.id} value={s.id}>{s.name}{s.archived ? ' (archived)' : ''}</option>)}
      </select>
    </div>
  );
}
