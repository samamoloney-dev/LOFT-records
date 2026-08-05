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

// Pilot Line Check: due 365 days after the anchor date (their initial Check
// to Line), then every 365 days after that - a fixed anniversary that does
// not move regardless of when each subsequent check is actually completed.
// completedCount is how many Line Checks have been completed since the
// anchor (not counting the anchor itself).
function pilotLineCheckDue(anchorDate, completedCount) {
  if (!anchorDate) return null;
  return addDays(new Date(anchorDate), 365 * (completedCount + 1));
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

// IPC/PC Spacing (Planning tab) - the gap in days between a pilot's last
// IPC and last PC, classified per the operator's own three-band rule
// (reverse-engineered from their spreadsheet's Spacing Status column):
//   150-210 days                    -> 'ok'         (green - the preferred
//                                                     +-1 month window
//                                                     around a 6-month cycle)
//   121-149 or 211-242 days         -> 'overridden' (amber - still within
//                                                     the 8-month/365-day
//                                                     ceiling, +-2 months)
//   <121 or >242 days               -> 'alert'      (red - breaches the
//                                                     acceptable recurrency
//                                                     spacing limit)
// A non-empty override comment promotes anything short of 'ok' straight to
// 'overridden' (a documented justification), even if the raw day-gap would
// otherwise read 'alert' - this exactly mirrors the spreadsheet's own
// formula, which checks the comment before the numeric bands.
const SPACING_OK_MIN = 150;
const SPACING_OK_MAX = 210;
const SPACING_OVERRIDDEN_MIN = 121;
const SPACING_OVERRIDDEN_MAX = 242;
const SPACING_TARGET_DAYS = 180;

function ipcPcSpacingStatus(lastIpc, lastPc, hasOverrideComment) {
  if (!lastIpc || !lastPc) return null;
  const spacingDays = Math.round(Math.abs(new Date(lastPc).getTime() - new Date(lastIpc).getTime()) / DAY_MS);
  let status;
  if (spacingDays >= SPACING_OK_MIN && spacingDays <= SPACING_OK_MAX) status = 'ok';
  else if (hasOverrideComment) status = 'overridden';
  else if (
    (spacingDays >= SPACING_OVERRIDDEN_MIN && spacingDays < SPACING_OK_MIN)
    || (spacingDays > SPACING_OK_MAX && spacingDays <= SPACING_OVERRIDDEN_MAX)
  ) status = 'overridden';
  else status = 'alert';
  return { spacingDays, status, overUnderRunDays: spacingDays - SPACING_TARGET_DAYS };
}

module.exports = { addDays, addMonths, nextDueRolling, pilotLineCheckDue, statusFor, competencyStatus, ipcPcSpacingStatus };
