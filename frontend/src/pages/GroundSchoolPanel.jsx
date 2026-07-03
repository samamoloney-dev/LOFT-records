import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';

function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  return groups;
}

function GroundSchoolItemRow({ item, onSignOff }) {
  const { user } = useAuth();
  const [signing, setSigning] = useState(false);
  const [name, setName] = useState(item.signedOffByName || user.name);
  const [error, setError] = useState(null);

  async function confirm() {
    if (!name.trim()) return;
    setError(null);
    try {
      await onSignOff(item.id, name.trim());
      setSigning(false);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          className={`tick-btn ${item.completedAt ? 'active-pass' : ''}`}
          onClick={() => setSigning((v) => !v)}
        >{item.completedAt ? '✓' : ''}</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13 }}>{item.description}</div>
          {item.notes && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.notes}</div>}
          {item.completedAt && (
            <div style={{ fontSize: 11, color: 'var(--text-success)' }}>
              Signed off by {item.signedOffByName} on {formatDate(item.completedAt)}
            </div>
          )}
        </div>
      </div>
      {signing && (
        <div style={{ display: 'flex', gap: 8, marginTop: 6, marginLeft: 32, alignItems: 'center' }}>
          <input
            style={{ maxWidth: 220 }}
            placeholder="Signed off by (name)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button className="primary" onClick={confirm}>Sign off</button>
          <button onClick={() => setSigning(false)}>Cancel</button>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

export function GroundSchoolPanel({ trainee }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    api.get(`/api/ground-school/trainee/${trainee.id}`).then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, [trainee.id]);

  async function signOff(itemId, signedOffByName) {
    await api.post(`/api/ground-school/trainee/${trainee.id}/complete`, { groundSchoolItemId: itemId, signedOffByName });
    load();
  }

  const outstanding = items.filter((i) => i.required && !i.completedAt);
  const grouped = groupByCategory(items);

  return (
    <div>
      <div className="card">
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Ground School</div>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No ground school items for this fleet yet.</div>
        ) : outstanding.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>All courses and exams complete.</div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-warning)' }}>
            {outstanding.length} course(s)/exam(s) outstanding before the simulator.
          </div>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {[...grouped.entries()].map(([category, categoryItems]) => (
        <div key={category} className="card">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{category}</div>
          {categoryItems.map((item) => (
            <GroundSchoolItemRow key={item.id} item={item} onSignOff={signOff} />
          ))}
        </div>
      ))}
    </div>
  );
}
