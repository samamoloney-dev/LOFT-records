// Classifies a plain due date (no grace window, unlike the backend's
// check-currency rules) against today - used for competencies, which just
// have a straight due date rather than a computed recurrency rule. Mirrors
// backend/src/lib/currency.js's competencyStatus - same graduated bands
// (important 1-10 days, due_soon 11-30, approaching 31-45 out).
export function competencyStatus(dueDate) {
  if (!dueDate) return 'not_completed'; // never completed - distinct from a lapsed renewal
  const due = new Date(dueDate);
  const today = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  if (today > due) return 'overdue';
  if (today >= new Date(due.getTime() - 10 * DAY_MS)) return 'important';
  if (today >= new Date(due.getTime() - 30 * DAY_MS)) return 'due_soon';
  if (today >= new Date(due.getTime() - 45 * DAY_MS)) return 'approaching';
  return 'ok';
}
