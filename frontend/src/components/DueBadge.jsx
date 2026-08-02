import { formatDate } from '../lib/format';

// Mirrors CurrencyOverview.jsx's STATUS_STYLES - overdue is bold on top of
// its red so it still reads as more urgent than Important despite both
// being red, per the operator's explicit "overdue must be in BOLD RED"
// request. Approaching is a paler yellow, deliberately the least alerting
// of the three graduated advance-warning bands (see backend/src/lib/
// currency.js's statusFor: important 1-10 days, due_soon 11-30, approaching
// 31-45).
const STYLES = {
  ok: { background: '#dff5e1', color: '#14632f' },
  important: { background: '#fbe1e1', color: '#9b2020' },
  due_soon: { background: '#fdf2d0', color: '#8a6100' },
  approaching: { background: '#fdf8d6', color: '#8a7f00' },
  overdue: { background: '#f8caca', color: '#7a1414', fontWeight: 700 },
  not_completed: { background: '#e0e7ff', color: '#3730a3' },
  in_training: { background: '#e5e7eb', color: '#4b5563' },
};

const LABELS = {
  ok: 'Current',
  important: 'Important',
  due_soon: 'Due Soon',
  approaching: 'Approaching',
  overdue: 'Overdue',
  not_completed: 'Not yet completed',
  in_training: 'In training',
};

// Distinguishes *why* an item reads "in_training" (see crew.js's
// trainingGateReason) - a trainee who's finished ground school but is
// still mid-LOFT shouldn't read "ground school not yet complete", since
// that's simply no longer true for them.
const IN_TRAINING_TEXT = {
  ground_school: 'Ground school not yet complete',
  in_loft: 'Not yet due - still completing LOFT training',
  new_hire_grace: 'Not yet due - new hire grace period',
};

// Small colour-coded pill for a single recurrency item's next-due date.
// `info` is the { dueDate, status, trainingGate, completedDate, plannedDate,
// issued, note } shape returned by the backend's currency object (see
// backend/src/routes/crew.js withCurrency). plannedDate is purely
// informational - an admin's note that a check is booked for a date,
// distinct from the computed due date. issued is set once that plan has
// actually turned into a real (not yet completed) check record - its own
// crew_planned_checks row is deleted the moment that happens (see
// crew.js's create-check route), so without this the "Planned for X" note
// would just silently vanish with nothing to show for it. note is a short
// server-supplied caveat about how the due date itself was worked out (only
// Proficiency Check sets one today - see crew.js's pcDueDateIsFirstEstimate,
// which flags that this due date is only an estimate 6 months out from the
// qualifying IPC since no dedicated PC has ever actually been completed).
export function DueBadge({ label, info }) {
  if (!info) return null;
  const text = info.dueDate
    ? `${LABELS[info.status]} · due ${formatDate(info.dueDate)}`
    : info.status === 'in_training' ? (IN_TRAINING_TEXT[info.trainingGate] || 'Ground school not yet complete') : 'Not yet current';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      <span
        className="badge"
        style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, ...STYLES[info.status] }}
      >{text}</span>
      {info.completedDate && (
        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Completed {formatDate(info.completedDate)}</div>
      )}
      {info.note && (
        <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{info.note}</div>
      )}
      {info.issued ? (
        <div style={{ fontSize: 10.5, color: 'var(--text-accent)' }}>Check Form Issued</div>
      ) : info.plannedDate && (
        <div style={{ fontSize: 10.5, color: 'var(--text-accent)' }}>Planned for {formatDate(info.plannedDate)}</div>
      )}
    </div>
  );
}
