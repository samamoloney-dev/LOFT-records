-- ARNs on staff profiles, and the ability for HOTC/HOFO/Flight Ops Admin to
-- assign a specific staff member as the assessor responsible for a check.

ALTER TABLE users ADD COLUMN arn TEXT;

ALTER TABLE checks ADD COLUMN assigned_to UUID REFERENCES users(id);
ALTER TABLE check_to_line_forms ADD COLUMN assigned_to UUID REFERENCES users(id);
