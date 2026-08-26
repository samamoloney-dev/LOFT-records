import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatDate } from '../lib/format';

// Tells whoever a check form is assigned to (or every admin, for full
// oversight) that it's still not completed more than a day after the date
// it was actually scheduled for - see backend/src/routes/checks.js GET
// /alerts/overdue-completion. Deliberately visible to any logged-in role,
// not just admins (mirrors CompletedChecksAlert.jsx's placement on Home
// and Checks, but that one is admin-only "go update records"; this one has
// to reach the actual examiner/check pilot, per the operator's explicit
// rule) - the backend already scopes `all` to admins only and leaves it
// empty for everyone else, so this component doesn't need its own role
// check to decide what it's allowed to see.
//
// No "dismiss" button like CompletedChecksAlert - the underlying problem
// (a check that should have happened hasn't) isn't resolved by
// acknowledging a banner, only by actually completing the check, so this
// stays up for as long as it's true.
export function OverdueCheckAlert() {
  const { user } = useAuth();
  const [data, setData] = useState({ mine: [], all: [] });

  useEffect(() => {
    api.get('/api/checks/alerts/overdue-completion').then(setData).catch(() => {});
  }, []);

  // `all` only ever comes back non-empty for an admin (see the backend
  // route), and always includes their own assigned checks too - so an
  // admin sees the whole roster's picture in one list rather than two
  // overlapping ones, while everyone else just sees their own.
  const rows = data.all.length > 0 ? data.all : data.mine;
  if (rows.length === 0) return null;

  return (
    <div className="card" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)', marginBottom: '1rem' }}>
      <div style={{ fontWeight: 500, marginBottom: 8 }}>
        {data.mine.length > 0
          ? `You have ${data.mine.length} check form${data.mine.length === 1 ? '' : 's'} overdue for completion`
          : `${rows.length} check form${rows.length === 1 ? '' : 's'} overdue for completion`}
      </div>
      {rows.map((r) => (
        <Link
          key={r.id}
          to={`/crew/${r.crewMemberId}?top=currency`}
          style={{ display: 'block', fontSize: 13, color: 'inherit', padding: '3px 0' }}
        >
          {r.crewMemberName} · {r.label} · scheduled {formatDate(r.scheduledDate)} ({r.daysOverdue} day{r.daysOverdue === 1 ? '' : 's'} overdue)
          {r.assignedTo === user.id ? ' · assigned to you' : r.assignedToName ? ` · assigned to ${r.assignedToName}` : ' · unassigned'}
        </Link>
      ))}
    </div>
  );
}
