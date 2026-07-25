// Checks lists (IPC/PC, Emergency Procedures, Line Check, Check to Line)
// list whatever's outstanding first - a checker opening the tab wants to
// see what still needs doing, not scroll past everything already passed.
// Completed checks (pass or fail - both are locked/done) sink to the
// bottom, otherwise keeping the order the list already arrived in.
export function sortNotCompletedFirst(checks) {
  return [...checks].sort((a, b) => (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0));
}
