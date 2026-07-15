import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet } from '../lib/format';
import { crewLinkForItem } from '../lib/checkNav';

const STATUS_ORDER = { overdue: 0, not_completed: 1, due_soon: 2, ok: 3, in_training: 4 };

const STATUS_STYLES = {
  overdue: { background: '#fbe1e1', color: '#8f1d1d' },
  due_soon: { background: '#fdf2d0', color: '#8a6100' },
  not_completed: { background: '#e0e7ff', color: '#3730a3' },
  ok: { background: '#dff5e1', color: '#14632f' },
  in_training: { background: '#e5e7eb', color: '#4b5563' },
};

const STATUS_TEXT = { overdue: 'Overdue', due_soon: 'Due soon', not_completed: 'Not yet completed', ok: 'Current', in_training: 'In training' };

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'not_completed', label: 'Not Yet Completed' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due Soon' },
  { key: 'ok', label: 'Current' },
  { key: 'in_training', label: 'In Training' },
];

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const FLEET_FILTERS = [{ key: 'all', label: 'All fleets' }, ...FLEET_VALUES.map((f) => ({ key: f, label: formatFleet(f) }))];

function FilterBar({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
      {options.map((f) => (
        <div
          key={f.key}
          onClick={() => onChange(f.key)}
          style={{
            padding: '6px 12px', border: '0.5px solid var(--border-strong)', borderRadius: 8,
            cursor: 'pointer', fontSize: 13,
            background: value === f.key ? 'var(--bg-accent)' : 'var(--surface-2)',
            color: value === f.key ? 'var(--text-accent)' : 'inherit',
          }}
        >{f.label}</div>
      ))}
    </div>
  );
}

// Calendar-day difference (not a 24h-period count), so a due date later
// today still reads as "due today" rather than "overdue" or "-1 days".
function daysToExpiry(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  const dueDay = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((dueDay - todayDay) / (24 * 60 * 60 * 1000));
}

function expiryText(dueDate) {
  const days = daysToExpiry(dueDate);
  if (days === null) return '';
  if (days === 0) return 'due today';
  if (days < 0) return `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  return `due in ${days} day${days === 1 ? '' : 's'}`;
}

function StatusPill({ status }) {
  return (
    <span style={{ ...STATUS_STYLES[status], display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
      {STATUS_TEXT[status]}
    </span>
  );
}

// Flattens a crew member's allItems (see backend/src/routes/crew.js
// withCurrency/allItemsFor) into rows for this page - every recurrent
// check and competency, whatever its status, so the whole roster's
// picture is visible here rather than just the problems. A planned date
// doesn't change the status (it's still due) - it's just shown alongside
// it as a reminder it's in hand.
function allRows(member) {
  return member.allItems.map((item) => ({
    memberId: member.id,
    name: member.name,
    fleets: member.fleets,
    fleet: member.fleets.map(formatFleet).join(', '),
    item: item.label,
    dueDate: item.dueDate,
    completedDate: item.completedDate,
    plannedDate: item.plannedDate,
    status: item.status,
  }));
}

export function CurrencyOverview() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  // Lets the Home Dashboard's summary cards (?filter=overdue etc.) and its
  // Fleet Currency Snapshot (?fleet=DASH_8 etc.) land here pre-filtered -
  // falls back to "all" for any unrecognised value.
  const requestedFilter = searchParams.get('filter');
  const [statusFilter, setStatusFilter] = useState(
    STATUS_FILTERS.some((f) => f.key === requestedFilter) ? requestedFilter : 'all',
  );
  const requestedFleet = searchParams.get('fleet');
  const [fleetFilter, setFleetFilter] = useState(
    FLEET_FILTERS.some((f) => f.key === requestedFleet) ? requestedFleet : 'all',
  );
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get('/api/crew?type=PILOT'),
      api.get('/api/crew?type=CABIN_ATTENDANT'),
    ])
      .then(([pilots, cabinAttendants]) => {
        const flattened = [...pilots, ...cabinAttendants].flatMap(allRows);
        flattened.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
        setRows(flattened);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-text">{error}</div>;

  const filteredRows = rows
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .filter((r) => fleetFilter === 'all' || r.fleets.includes(fleetFilter));

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Every recurrent check and competency across the roster - not yet completed and overdue items need attention first
      </div>
      <FilterBar options={FLEET_FILTERS} value={fleetFilter} onChange={setFleetFilter} />
      <FilterBar options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />

      {filteredRows.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing here.</div>}
      {filteredRows.map((r, i) => (
        <div key={i} className="card row" onClick={() => navigate(crewLinkForItem(r.memberId, r.item))}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {r.fleet} · {r.item}{r.completedDate ? ` · Completed ${formatDate(r.completedDate)}` : ''}{r.dueDate ? ` · Due ${formatDate(r.dueDate)} (${expiryText(r.dueDate)})` : ''}
            </div>
            {r.plannedDate && <div style={{ fontSize: 11, color: 'var(--text-accent)', marginTop: 2 }}>Planned for {formatDate(r.plannedDate)}</div>}
          </div>
          <StatusPill status={r.status} />
        </div>
      ))}
    </div>
  );
}
