// Checks lists (IPC/PC, Emergency Procedures, Line Check, Check to Line,
// Ground Instructor Check, Personnel (Air) Competency Check) list whatever's
// outstanding first - a checker opening the tab wants to see what still
// needs doing, not scroll past everything already passed. Completed checks
// (pass or fail - both are locked/done) sink to the bottom. Among the
// not-yet-completed ones, whichever is dated soonest - the most limiting -
// sorts first; undated ones (nothing scheduled yet) sort after the dated
// ones since there's no urgency to compare against.
//
// dateOf lets each list say where its own date field lives - the field
// name/shape differs by check type (most keep it at details.date, Ground
// Instructor Check uses dateOfObservation, Personnel Competency uses
// checkDate).
export function sortNotCompletedFirst(checks, dateOf = (c) => c.details?.date) {
  return [...checks].sort((a, b) => {
    const aDone = a.completedAt ? 1 : 0;
    const bDone = b.completedAt ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    if (aDone) return 0;
    const ad = dateOf(a) || '';
    const bd = dateOf(b) || '';
    if (ad === bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return ad < bd ? -1 : 1;
  });
}
