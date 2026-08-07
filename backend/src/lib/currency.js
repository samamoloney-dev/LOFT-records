// Due-date rules for crew recurrency (see docs discussion in the "Crew"
// feature plan): EP/IPC/CA Line Check/Proficiency Check all roll forward
// 365 days from the last completed check; the pilot Line Check is anchored
// to a fixed date (their initial Check to Line) and never shifts, unlike
// the others.

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

// Calendar-month arithmetic (e.g. 15 Jan -> 15 Jul), as opposed to addDays'
// fixed day-count approximation - a 182-day add drifts a day or two off
// the actual six-month anniversary depending which months it spans, which
// is enough to flag something overdue a day early. Clamps to the target
// month's last day if the source day doesn't exist there (e.g. 31 Jan + 1
// month -> 28/29 Feb, not an overflowed 2/3 Mar).
function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
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

// Pilot Line Check: due on the anchor date's calendar anniversary (their
// initial Check to Line), one year on, then every year after that - a
// fixed anniversary that does not move regardless of when each subsequent
// check is actually completed. completedCount is how many Line Checks have
// been completed since the anchor (not counting the anchor itself).
// Deliberately addMonths(12*n), not addDays(365*n) - a fixed day-count
// drifts against the real calendar anniversary by a day or two per leap
// year spanned (see addMonths' own comment above), which for a career-long
// anchor is no longer a rounding error - it can flag a Line Check overdue
// a day or two before its real due date. addDays is still correct for
// nextDueRolling above, whose 365-day clocks are genuinely rolling windows
// rather than a fixed calendar date.
function pilotLineCheckDue(anchorDate, completedCount) {
  if (!anchorDate) return null;
  return addMonths(new Date(anchorDate), 12 * (completedCount + 1));
}

// Three graduated advance-warning bands ahead of the real deadline, closest
// first - per the operator's explicit request to distinguish how urgently
// each should be alerted, rather than one flat "due soon" window covering
// everything from 1 to 60 days out:
//   1-10 days out  -> 'important'   (red)
//   11-30 days out -> 'due_soon'    (amber) - keeps the pre-existing key/label
//   31-45 days out -> 'approaching' (yellow, least alerting of the three)
// Beyond 45 days (or the item's simply not due yet) is 'ok'. None of these
// mean the check has lapsed - only 'overdue' does.
const IMPORTANT_DAYS = 10;
const DUE_SOON_DAYS = 30;
const APPROACHING_DAYS = 45;

// Classifies a due date relative to today.
function statusFor(dueDate) {
  if (!dueDate) return 'overdue'; // never completed - treat as immediately due
  const today = new Date();
  if (today > dueDate) return 'overdue';
  if (today >= addDays(dueDate, -IMPORTANT_DAYS)) return 'important';
  if (today >= addDays(dueDate, -DUE_SOON_DAYS)) return 'due_soon';
  if (today >= addDays(dueDate, -APPROACHING_DAYS)) return 'approaching';
  return 'ok';
}

// Competencies (Dangerous Goods etc.) have a straight due date rather than
// a computed recurrency rule/grace window - mirrors the frontend's
// lib/dueStatus.js competencyStatus, kept as its own small function here
// (rather than a computed rule like statusFor above) since it needs to run
// server-side for the crew list's urgentItems (see crew.js). Same
// important/due_soon/approaching bands as statusFor, for consistency.
function competencyStatus(dueDate) {
  if (!dueDate) return 'not_completed'; // never completed - distinct from a lapsed renewal
  const due = new Date(dueDate);
  const today = new Date();
  if (today > due) return 'overdue';
  if (today >= addDays(due, -IMPORTANT_DAYS)) return 'important';
  if (today >= addDays(due, -DUE_SOON_DAYS)) return 'due_soon';
  if (today >= addDays(due, -APPROACHING_DAYS)) return 'approaching';
  return 'ok';
}

// The operator (Skippers Aviation) is based in Perth, Western Australia
// (AWST, UTC+8, no daylight saving - so no DST-transition edge case to
// worry about, just a constant offset). A handful of DATE columns (e.g.
// crew_members.line_check_anchor_date) get written from a moment-in-time
// (an examiner clicking "Complete" right now) rather than a value the user
// actually typed into a date field - writing that straight as SQL now() (or
// passing a JS Date to a DATE-column parameter) truncates to a calendar
// date using the database session's own timezone, which on a managed host
// is typically UTC, not Perth's. A Check to Line completed in the early
// hours of an AWST morning (any time before ~8am local, since AWST is 8
// hours ahead of UTC) would truncate onto the *previous* UTC calendar day -
// silently anchoring that pilot's whole future Line Check anniversary
// sequence a day earlier than the real event. Use this instead of now()
// wherever a moment-in-time needs to become "today's date" for a DATE
// column.
const OPERATOR_TIMEZONE = 'Australia/Perth';
function localDateString(instant = new Date(), timeZone = OPERATOR_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

module.exports = { addDays, addMonths, nextDueRolling, pilotLineCheckDue, statusFor, competencyStatus, localDateString };
