// Check-form items (EP/Line Check/IPC-PC/GIC/PAC/Check to Line item lists)
// can be archived from the Syllabus admin tab once retired. GET
// /api/check-form-items defaults to active-only, which is right for
// picking items to tick on a brand new check - but a historical check that
// already ticked a since-archived item would otherwise silently lose that
// row entirely. Fetch the full list (?includeArchived=true) and use this
// to decide what's actually shown: every active item, plus any archived
// item this particular check already has an answer for.
export function visibleCheckFormItems(allItems, answers) {
  return (allItems || []).filter((item) => !item.archived || (answers && answers[item.id] !== undefined));
}
