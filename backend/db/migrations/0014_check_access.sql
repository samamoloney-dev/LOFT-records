-- Per-staff check access, ticked on the staff profile. Drives which staff
-- show up as selectable assessors/assignees on each check form - HOTC/HOFO/
-- Flight Ops Admin always show up regardless (enforced in application code).

CREATE TYPE check_access_type AS ENUM ('PC', 'IPC', 'LINE_CHECK', 'CHECK_TO_LINE', 'EMERGENCY_PROCEDURES');

ALTER TABLE users ADD COLUMN check_access check_access_type[] NOT NULL DEFAULT '{}';
