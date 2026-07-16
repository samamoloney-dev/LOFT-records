import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

// Deliberately narrower than the usual HOTC/HOFO/Flight Ops Admin/Alternate
// admin quartet - completed-check notifications go to HOTC, HOFO and
// Flight Ops Admin only, per the operator's explicit request (Alternate
// does not get these).
const NOTIFICATION_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

// Tells an admin an IPC/PC/EP/Line Check/Check to Line just finished, so
// they know to go update the crew member's records elsewhere (this app
// doesn't do that automatically) - see checks.js GET/POST /alerts/*. Mirrors
// the red count badge on the Checks nav tab (App.jsx ChecksAlertBadge),
// which this banner's "Mark reviewed" button clears. Shared between the
// Checks page and the Home dashboard so an admin sees it the moment they
// log in, not just after clicking into Checks.
export function CompletedChecksAlert() {
  const { user } = useAuth();
  const canSee = NOTIFICATION_ROLES.includes(user.role);
  const [count, setCount] = useState(0);
  const [breakdown, setBreakdown] = useState([]);
  const [error, setError] = useState(null);

  function load() {
    if (!canSee) return;
    api.get('/api/checks/alerts/count').then((d) => { setCount(d.count); setBreakdown(d.breakdown || []); }).catch(() => {});
  }
  useEffect(load, [canSee]);

  async function markReviewed() {
    setError(null);
    try { await api.post('/api/checks/alerts/mark-reviewed'); setCount(0); setBreakdown([]); }
    catch (err) { setError(err.message); }
  }

  if (!canSee || count === 0) return null;
  const summary = breakdown.map((b) => `${b.count} ${b.label}`).join(', ');
  return (
    <div className="card row" style={{ background: 'var(--bg-warning)', color: 'var(--text-warning)', marginBottom: '1rem' }}>
      <div style={{ flex: 1, fontSize: 13 }}>
        {summary || `${count} check${count === 1 ? '' : 's'}`} recently completed - go update the crew's records.
        {error && <div className="error-text">{error}</div>}
      </div>
      <button onClick={markReviewed}>Mark reviewed</button>
    </div>
  );
}
