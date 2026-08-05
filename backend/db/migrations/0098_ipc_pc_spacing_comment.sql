-- IPC/PC Spacing report (Planning tab): per-pilot free text justifying an
-- out-of-band gap between their last IPC and last PC (e.g. "IPC Oct 26 for
-- 6 months") - mirrors the operator's own "Override / Comment" column from
-- the spreadsheet this feature replaces. A non-empty comment can promote an
-- otherwise-ALERT spacing to OVERRIDDEN, per the operator's documented
-- rules for that report (see backend/src/lib/currency.js ipcPcSpacingStatus).
ALTER TABLE crew_members ADD COLUMN pc_ipc_override_comment TEXT;
