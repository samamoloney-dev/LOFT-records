-- Lets an admin assign an examiner/instructor/check pilot to a planned
-- check ahead of time (e.g. "Fokker 100 IPC booked for 15 Aug, assigned to
-- J Smith") from the new Planning page, not just a bare date - mirrors the
-- assignee snapshot pattern used on checks/check_to_line_forms/
-- landing_assessment_forms elsewhere, so it survives the assignee's
-- account later being deleted.
ALTER TABLE crew_planned_checks ADD COLUMN assigned_to      UUID REFERENCES users(id);
ALTER TABLE crew_planned_checks ADD COLUMN assigned_to_name TEXT;
ALTER TABLE crew_planned_checks ADD COLUMN assigned_to_arn  TEXT;
ALTER TABLE crew_planned_checks ADD COLUMN assigned_to_role TEXT;
