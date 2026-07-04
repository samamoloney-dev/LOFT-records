import { formatDate } from '../lib/format';

const STYLES = {
  ok: { background: '#dff5e1', color: '#14632f' },
  due_soon: { background: '#fdf2d0', color: '#8a6100' },
  overdue: { background: '#fbe1e1', color: '#8f1d1d' },
};

const LABELS = {
  ok: 'Current',
  due_soon: 'Due soon',
  overdue: 'Overdue',
};

// Small colour-coded pill for a single recurrency item's next-due date.
// `info` is the { dueDate, status } shape returned by the backend's
// currency object (see backend/src/lib/currency.js).
export function DueBadge({ label, info }) {
  if (!info) return null;
  const text = info.dueDate ? `${LABELS[info.status]} · due ${formatDate(info.dueDate)}` : 'Not yet current';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      <span
        className="badge"
        style={{ ...STYLES[info.status], display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}
      >{text}</span>
    </div>
  );
}
