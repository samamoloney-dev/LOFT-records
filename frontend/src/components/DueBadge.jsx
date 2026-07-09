import { formatDate } from '../lib/format';

const STYLES = {
  ok: { background: '#dff5e1', color: '#14632f' },
  due_soon: { background: '#fdf2d0', color: '#8a6100' },
  overdue: { background: '#fbe1e1', color: '#8f1d1d' },
  not_completed: { background: '#e0e7ff', color: '#3730a3' },
  in_training: { background: '#e5e7eb', color: '#4b5563' },
};

const LABELS = {
  ok: 'Current',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  not_completed: 'Not yet completed',
  in_training: 'In training',
};

// Small colour-coded pill for a single recurrency item's next-due date.
// `info` is the { dueDate, status, completedDate, plannedDate } shape
// returned by the backend's currency object (see
// backend/src/routes/crew.js withCurrency). plannedDate is purely
// informational - an admin's note that a check is booked for a date,
// distinct from the computed due date.
export function DueBadge({ label, info }) {
  if (!info) return null;
  const text = info.dueDate
    ? `${LABELS[info.status]} · due ${formatDate(info.dueDate)}`
    : info.status === 'in_training' ? 'Ground school not yet complete' : 'Not yet current';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      <span
        className="badge"
        style={{ ...STYLES[info.status], display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}
      >{text}</span>
      {info.completedDate && (
        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Completed {formatDate(info.completedDate)}</div>
      )}
      {info.plannedDate && (
        <div style={{ fontSize: 10.5, color: 'var(--text-accent)' }}>Planned for {formatDate(info.plannedDate)}</div>
      )}
    </div>
  );
}
