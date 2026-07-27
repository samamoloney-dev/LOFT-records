-- Lets HOTC/HOFO/Flight Ops Admin type a reason a recurrent check is
-- currently overdue (e.g. "Awaiting simulator availability", "On extended
-- leave") - purely informational, same as the existing planned date/
-- assignee on this table. A reason can now exist with no planned date yet
-- (just an explanation, nothing booked in), so planned_date can no longer
-- be required.
ALTER TABLE crew_planned_checks ALTER COLUMN planned_date DROP NOT NULL;
ALTER TABLE crew_planned_checks ADD COLUMN reason TEXT;
