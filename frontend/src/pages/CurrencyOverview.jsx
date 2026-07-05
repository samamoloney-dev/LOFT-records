import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { formatDate, formatFleet } from '../lib/format';
import { competencyStatus } from '../lib/dueStatus';

const STATUS_ORDER = { overdue: 0, due_soon: 1, ok: 2 };

const CURRENCY_LABELS = {
  emergencyProcedures: 'Emergency Procedures',
  ipc: 'IPC',
  proficiencyCheck: 'Proficiency Check',
  lineCheck: 'Line Check',
};

const STATUS_STYLES = {
  overdue: { background: '#fbe1e1', color: '#8f1d1d' },
  due_soon: { background: '#fdf2d0', color: '#8a6100' },
  ok: { background: '#dff5e1', color: '#14632f' },
};

const STATUS_TEXT = { overdue: 'Overdue', due_soon: 'Due soon', ok: 'Current' };

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'due_soon', label: 'Due Soon' },
  { key: 'ok', label: 'Current' },
];

function StatusFilterBar({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
      {STATUS_FILTERS.map((f) => (
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

function StatusPill({ status }) {
  return (
    <span style={{ ...STATUS_STYLES[status], display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
      {STATUS_TEXT[status]}
    </span>
  );
}

// Flattens a crew member's computed `currency` object (see
// backend/src/routes/crew.js withCurrency) into one row per applicable
// check type, so every crew member's due items can be sorted together
// regardless of how many recurrency items apply to them.
function currencyRows(member) {
  return Object.entries(member.currency)
    .filter(([, info]) => info)
    .map(([key, info]) => ({
      memberId: member.id,
      name: `${member.firstName} ${member.lastName}`,
      fleet: member.fleets.map(formatFleet).join(', '),
      item: CURRENCY_LABELS[key] || key,
      dueDate: info.dueDate,
      completedDate: info.completedDate,
      status: info.status,
    }));
}

export function CurrencyOverview() {
  const [rows, setRows] = useState([]);
  const [competencyRows, setCompetencyRows] = useState([]);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get('/api/crew?type=PILOT'),
      api.get('/api/crew?type=CABIN_ATTENDANT'),
    ])
      .then(async ([pilots, cabinAttendants]) => {
        const members = [...pilots, ...cabinAttendants];
        const flattened = members.flatMap(currencyRows);
        flattened.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
        setRows(flattened);

        const competencyLists = await Promise.all(
          members.map((m) => api.get(`/api/crew/${m.id}/competencies`).then((cs) => cs.map((c) => ({ ...c, memberId: m.id, memberName: `${m.firstName} ${m.lastName}` }))).catch(() => [])),
        );
        const dueSoon = competencyLists
          .flat()
          .map((c) => ({ ...c, status: competencyStatus(c.dueDate) }))
          .filter((c) => c.status === 'overdue' || c.status === 'due_soon');
        dueSoon.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
        setCompetencyRows(dueSoon);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error-text">{error}</div>;

  const filteredRows = statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter);
  const filteredCompetencyRows = statusFilter === 'all' ? competencyRows : competencyRows.filter((c) => c.status === statusFilter);

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Every crew member's recurrent checks, most overdue first
      </div>
      <StatusFilterBar value={statusFilter} onChange={setStatusFilter} />

      {filteredRows.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No crew currency data matches this filter.</div>}
      {filteredRows.map((r, i) => (
        <div key={i} className="card row" onClick={() => navigate(`/crew/${r.memberId}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {r.fleet} · {r.item}{r.completedDate ? ` · Completed ${formatDate(r.completedDate)}` : ''}{r.dueDate ? ` · Due ${formatDate(r.dueDate)}` : ''}
            </div>
          </div>
          <StatusPill status={r.status} />
        </div>
      ))}

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '1.5rem 0 1rem' }}>
        Competencies due within 30 days or overdue
      </div>
      {filteredCompetencyRows.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing matches this filter.</div>}
      {filteredCompetencyRows.map((c) => (
        <div key={c.id} className="card row" onClick={() => navigate(`/crew/${c.memberId}`)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{c.memberName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.name}{c.dueDate ? ` · Due ${formatDate(c.dueDate)}` : ''}</div>
          </div>
          <StatusPill status={c.status} />
        </div>
      ))}
    </div>
  );
}
