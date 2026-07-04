-- Staff names on historical records (who trained a flight, who a check is
-- assigned to) were being resolved live against the users table, so a
-- deleted staff member's name would vanish from work they'd already left in
-- the system. Snapshot the name (and ARN, where relevant) as plain text at
-- the time of the action instead, and let the underlying account be removed
-- without losing that history.

ALTER TABLE flights ADD COLUMN training_captain_name TEXT;
UPDATE flights f SET training_captain_name = u.name FROM users u WHERE u.id = f.training_captain_id;

ALTER TABLE flights ALTER COLUMN training_captain_id DROP NOT NULL;
ALTER TABLE flights DROP CONSTRAINT flights_training_captain_id_fkey;
ALTER TABLE flights ADD CONSTRAINT flights_training_captain_id_fkey
  FOREIGN KEY (training_captain_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE checks ADD COLUMN assigned_to_name TEXT;
ALTER TABLE checks ADD COLUMN assigned_to_arn TEXT;
UPDATE checks c SET assigned_to_name = u.name, assigned_to_arn = u.arn FROM users u WHERE u.id = c.assigned_to;

ALTER TABLE check_to_line_forms ADD COLUMN assigned_to_name TEXT;
ALTER TABLE check_to_line_forms ADD COLUMN assigned_to_arn TEXT;
UPDATE check_to_line_forms ctl SET assigned_to_name = u.name, assigned_to_arn = u.arn FROM users u WHERE u.id = ctl.assigned_to;
