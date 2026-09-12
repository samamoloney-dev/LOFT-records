-- Lets HOTC/HOFO/Flight Ops Admin note why a competency has expired (e.g.
-- "In LOFT", "Sick Leave"), same fixed-choice reason already used for
-- overdue recurrent checks (crew_planned_checks.reason) - kept here rather
-- than on that table since a competency isn't a "planned check" and has no
-- crew_planned_checks row of its own.
ALTER TABLE crew_competencies ADD COLUMN reason TEXT;
