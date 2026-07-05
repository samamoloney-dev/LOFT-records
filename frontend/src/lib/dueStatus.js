// Classifies a plain due date (no grace window, unlike the backend's
// check-currency rules) against today - used for competencies, which just
// have a straight due date rather than a computed recurrency rule.
export function competencyStatus(dueDate) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  const soonThreshold = new Date(due.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (today > due) return 'overdue';
  if (today >= soonThreshold) return 'due_soon';
  return 'ok';
}
