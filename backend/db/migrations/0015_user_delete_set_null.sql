-- Deleting a staff member was blocked by incidental attribution (audit log
-- entries, who signed something off, who a check happened to be assigned
-- to) rather than genuinely load-bearing relationships. Almost every staff
-- member has at least an audit_log row just from logging in, so this made
-- deletion fail for nearly everyone. Relax those to SET NULL - the record
-- itself is kept, just without a name attached. flights.training_captain_id
-- (NOT NULL) and trainees.user_id are left as hard blocks: those really
-- shouldn't be silently orphaned.

ALTER TABLE audit_log DROP CONSTRAINT audit_log_user_id_fkey;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE syllabus_progress DROP CONSTRAINT syllabus_progress_signed_off_by_fkey;
ALTER TABLE syllabus_progress ADD CONSTRAINT syllabus_progress_signed_off_by_fkey
  FOREIGN KEY (signed_off_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE flight_syllabus_progress DROP CONSTRAINT flight_syllabus_progress_signed_off_by_fkey;
ALTER TABLE flight_syllabus_progress ADD CONSTRAINT flight_syllabus_progress_signed_off_by_fkey
  FOREIGN KEY (signed_off_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ground_school_progress DROP CONSTRAINT ground_school_progress_signed_off_by_fkey;
ALTER TABLE ground_school_progress ADD CONSTRAINT ground_school_progress_signed_off_by_fkey
  FOREIGN KEY (signed_off_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE checks DROP CONSTRAINT checks_completed_by_fkey;
ALTER TABLE checks ADD CONSTRAINT checks_completed_by_fkey
  FOREIGN KEY (completed_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE checks DROP CONSTRAINT checks_assigned_to_fkey;
ALTER TABLE checks ADD CONSTRAINT checks_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE check_to_line_forms DROP CONSTRAINT check_to_line_forms_assigned_to_fkey;
ALTER TABLE check_to_line_forms ADD CONSTRAINT check_to_line_forms_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
