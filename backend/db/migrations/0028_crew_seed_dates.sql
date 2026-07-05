-- Quick-adding a crew member used to seed their currency clock by inserting
-- a synthetic completed "checks" row for each date entered (last EP date,
-- last IPC date, etc.) - but that row had no real assessor, items or
-- signatures, so it looked like an empty check form had been issued and
-- completed through the app when nothing was actually conducted here.
--
-- These columns hold the same seed dates directly on crew_members instead,
-- exactly like line_check_anchor_date already does for the pilot Line Check
-- anniversary - no checks row is created, the date is just an input to the
-- due-date calculation (see backend/src/routes/crew.js withCurrency).
ALTER TABLE crew_members ADD COLUMN seed_ep_date DATE;
ALTER TABLE crew_members ADD COLUMN seed_ipc_date DATE;
ALTER TABLE crew_members ADD COLUMN seed_pc_date DATE;
ALTER TABLE crew_members ADD COLUMN seed_line_check_date DATE;
