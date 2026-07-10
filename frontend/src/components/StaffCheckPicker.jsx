import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatUserRole } from '../lib/format';

// Staff-level checks (Ground Instructor Competency Check, Flight Standards
// Personnel (Air) Competency Check) are keyed to a specific staff member,
// same as EP/IPC/PC are keyed to a specific pilot - this is the equivalent
// "pick who, then show their check history" front door for the Checks tab,
// mirroring CheckToLinePicker/CaptainInTrainingPicker's crew-member pickers.
export function StaffCheckPicker({ roles, description, renderForm }) {
  const [staff, setStaff] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/users/roster').then(setStaff).catch((e) => setError(e.message));
  }, []);

  const eligible = staff.filter((s) => roles.includes(s.role));
  const selected = eligible.find((s) => s.id === selectedId);

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelectedId(null)} style={{ marginBottom: '1rem' }}>← Back</button>
        <div className="card">
          <div style={{ fontWeight: 500 }}>{selected.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatUserRole(selected.role)}</div>
        </div>
        {renderForm(selected)}
      </div>
    );
  }

  return (
    <div>
      {description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>{description}</div>}
      {error && <div className="error-text">{error}</div>}
      {eligible.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No eligible staff found.</div>}
      {eligible.map((s) => (
        <div key={s.id} className="card row" onClick={() => setSelectedId(s.id)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatUserRole(s.role)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
