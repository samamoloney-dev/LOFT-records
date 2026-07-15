-- Tracks whether a completed IPC/PC/EP/Line Check/Check to Line has been
-- reviewed by an admin yet - drives the red alert badge on the Checks nav
-- tab ("a check just finished, go update the crew's records") until
-- someone marks it reviewed. Null while pending; set once acknowledged.
ALTER TABLE checks ADD COLUMN reviewed_at TIMESTAMPTZ;
ALTER TABLE check_to_line_forms ADD COLUMN reviewed_at TIMESTAMPTZ;
