import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const RATINGS = ['Below standard', 'Standard', 'Above average', 'Outstanding'];

export function FlightRow({ flight, onChange }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [comments, setComments] = useState(flight.debriefComments || '');
  const [rating, setRating] = useState(flight.loftPerformanceRating || '');
  const [error, setError] = useState(null);

  const canEdit = user.role === 'TRAINING_CAPTAIN' && user.id === flight.trainingCaptainId && !flight.locked;
  const canAcknowledge = user.role === 'TRAINEE' && user.traineeId === flight.traineeId && flight.locked && !flight.acknowledgedByTrainee;

  async function saveComments() {
    setError(null);
    try {
      const updated = await api.patch(`/api/flights/${flight.id}`, { debriefComments: comments });
      onChange(updated);
    } catch (err) { setError(err.message); }
  }

  async function saveRating(value) {
    setError(null);
    setRating(value);
    try {
      const updated = await api.patch(`/api/flights/${flight.id}`, { loftPerformanceRating: value });
      onChange(updated);
    } catch (err) { setError(err.message); }
  }

  async function finalize() {
    setError(null);
    try { onChange(await api.post(`/api/flights/${flight.id}/finalize`)); }
    catch (err) { setError(err.message); }
  }

  async function acknowledge() {
    setError(null);
    try { onChange(await api.post(`/api/flights/${flight.id}/acknowledge`)); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 500 }}>{new Date(flight.date).toLocaleDateString()} · {Number(flight.hours)}h</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {flight.locked ? 'Finalized' : 'Draft'}
            {flight.acknowledgedByTrainee ? ' · Acknowledged by trainee' : ''}
          </div>
        </div>
        {(canEdit || canAcknowledge) && (
          <button onClick={() => setEditing((v) => !v)}>{editing ? 'Close' : 'Open'}</button>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="field">
            <label>Debrief comments</label>
            <textarea
              disabled={!canEdit}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              onBlur={saveComments}
              style={{ minHeight: 70 }}
            />
          </div>
          <div className="field">
            <label>LOFT performance rating</label>
            <select disabled={!canEdit} value={rating} onChange={(e) => saveRating(e.target.value)}>
              <option value="">—</option>
              {RATINGS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {canEdit && <button className="primary" onClick={finalize}>Finalize flight</button>}
          {canAcknowledge && <button className="primary" onClick={acknowledge}>Acknowledge debrief</button>}
          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </div>
  );
}
