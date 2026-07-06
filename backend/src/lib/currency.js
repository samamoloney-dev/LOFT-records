// Due-date rules for crew recurrency (see docs discussion in the "Crew"
// feature plan): EP/IPC/CA Line Check roll forward from the last completed
// check; the pilot Proficiency Check has a 6-month nominal/8-month grace/
// 4-month minimum cycle; the pilot Line Check is anchored to a fixed date
// (their initial Check to Line) and never shifts, unlike the others.

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

// EP (pilot and cabin attendant), IPC, and cabin attendant Line Check: due
// 365 days after the most recent completed check of that type.
function nextDueRolling(lastCompletedAt) {
  if (!lastCompletedAt) return null;
  return addDays(new Date(lastCompletedAt), 365);
}

// Pilot Proficiency Check: nominal due 6 months after the last one, with a
// grace period out to 8 months before it's non-current. A PC completed less
// than 4 months after the previous one is too early to count towards the
// cycle (the caller should reject/flag it rather than treat it as resetting
// the clock).
function pcWindow(lastCompletedAt) {
  if (!lastCompletedAt) return null;
  const last = new Date(lastCompletedAt);
  return {
    targetDue: addMonths(last, 6),
    hardExpiry: addMonths(last, 8),
    minNext: addMonths(last, 4),
  };
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

// Classifies a due date (or a PC-style window) relative to today.
function statusFor(dueDate, { hardExpiry } = {}) {
  if (!dueDate) return 'overdue'; // never completed - treat as immediately due
  const today = new Date();
  const expiry = hardExpiry || dueDate;
  if (today > expiry) return 'overdue';
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
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date();
  if (today > due) return 'overdue';
  if (today >= addDays(due, -COMPETENCY_SOON_DAYS)) return 'due_soon';
  return 'ok';
}

module.exports = { addDays, addMonths, nextDueRolling, pcWindow, pilotLineCheckDue, statusFor, competencyStatus };
