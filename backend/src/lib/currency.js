// Due-date rules for crew recurrency (see docs discussion in the "Crew"
// feature plan): EP/IPC/CA Line Check/Proficiency Check all roll forward
// 365 days from the last completed check; the pilot Line Check is anchored
// to a fixed date (their initial Check to Line) and never shifts, unlike
// the others.

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

// EP (pilot and cabin attendant), IPC, cabin attendant Line Check, and the
// pilot Proficiency Check: due 365 days after the most recent completed
// check of that type. days defaults to 365 but is overridable for longer
// cycles, e.g. the Flight Standards Personnel (Air) Competency Check
// (SA_518), which renews every 24 months (730 days) - see users.js
// withPersonnelAirCompetency.
function nextDueRolling(lastCompletedAt, days = 365) {
  if (!lastCompletedAt) return null;
  return addDays(new Date(lastCompletedAt), days);
}

// Pilot Line Check: due 365 days after the anchor date (their initial Check
// to Line), then every 365 days after that - a fixed anniversary that does
// not move regardless of when each subsequent check is actually completed.
// completedCount is how many Line Checks have been completed since the
// anchor (not counting the anchor itself).
function pilotLineCheckDue(anchorDate, completedCount) {
  if (!anchorDate) return null;
  return addDays(new Date(anchorDate), 365 * (completedCount + 1));
}

const DUE_SOON_DAYS = 60;

// Classifies a due date relative to today.
function statusFor(dueDate) {
  if (!dueDate) return 'overdue'; // never completed - treat as immediately due
  const today = new Date();
  if (today > dueDate) return 'overdue';
  const soonThreshold = addDays(dueDate, -DUE_SOON_DAYS);
  if (today >= soonThreshold) return 'due_soon';
  return 'ok';
}

const COMPETENCY_SOON_DAYS = 30;

// Competencies (Dangerous Goods etc.) have a straight due date rather than
// a computed recurrency rule/grace window - mirrors the frontend's
// lib/dueStatus.js competencyStatus, kept as its own small function here
// (rather than a computed rule like statusFor above) since it needs to run
// server-side for the crew list's urgentItems (see crew.js).
function competencyStatus(dueDate) {
  if (!dueDate) return 'not_completed'; // never completed - distinct from a lapsed renewal
  const due = new Date(dueDate);
  const today = new Date();
  if (today > due) return 'overdue';
  if (today >= addDays(due, -COMPETENCY_SOON_DAYS)) return 'due_soon';
  return 'ok';
}

module.exports = { addDays, nextDueRolling, pilotLineCheckDue, statusFor, competencyStatus };
