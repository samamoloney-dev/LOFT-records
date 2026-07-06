-- Crew members (pilots/cabin attendants already qualified and flying the
-- line) hold their own ARN, distinct from a staff account's ARN - lets it
-- be captured once on the Crew profile and reused (e.g. autofilled into
-- the Applicant's ARN field on an IPC/PC check) instead of retyped per
-- check. Nullable at the DB level since existing rows have none yet, but
-- the application requires it going forward (see crew.js quickAddSchema).
ALTER TABLE crew_members ADD COLUMN arn TEXT;
