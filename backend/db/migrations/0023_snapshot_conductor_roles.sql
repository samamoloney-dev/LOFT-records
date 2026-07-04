-- Extends the existing name-snapshot pattern (0017) to also snapshot the
-- conductor's role, so the app can show a specific title (e.g. "Training
-- Captain", "Examiner") instead of a generic "Trainer"/"Assessor" word.
-- Backfilled from the still-linked user where possible; records whose
-- linked user has since been deleted keep their existing generic wording
-- (their role was never recoverable, same limitation as pre-0017 names).

-- users.role is the user_role enum; these snapshot columns are plain TEXT
-- (same as the existing assigned_to_name/arn columns), so the enum needs an
-- explicit cast - Postgres doesn't coerce enum -> text automatically.
ALTER TABLE flights ADD COLUMN training_captain_role TEXT;
UPDATE flights f SET training_captain_role = u.role::text FROM users u WHERE u.id = f.training_captain_id;

ALTER TABLE checks ADD COLUMN assigned_to_role TEXT;
UPDATE checks c SET assigned_to_role = u.role::text FROM users u WHERE u.id = c.assigned_to;

ALTER TABLE check_to_line_forms ADD COLUMN assigned_to_role TEXT;
UPDATE check_to_line_forms ctl SET assigned_to_role = u.role::text FROM users u WHERE u.id = ctl.assigned_to;
