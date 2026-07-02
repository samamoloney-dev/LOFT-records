import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export function Archive() {
  const [trainees, setTrainees] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/trainees?archived=true').then(setTrainees).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '1rem' }}>Archived records (visible to HOTC / HOFO / Flight Ops Admin only)</div>
      {error && <div className="error-text">{error}</div>}
      {trainees.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No archived trainees.</div>}
      {trainees.map((t) => (
        <div key={t.id} className="card row" onClick={() => navigate(`/trainees/${t.id}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{t.firstName} {t.lastName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.fleet} · Archived {t.archivedAt ? new Date(t.archivedAt).toLocaleDateString() : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
