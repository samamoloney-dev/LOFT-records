-- One-time reset requested by the operator to move from test/demo data to a
-- real deployment: clears every trainee, crew member, and check record, and
-- every staff login except the operator's own, so the real roster can be
-- entered fresh. Deliberately a data migration, not a schema change - this
-- is the only mechanism available to run a one-off statement against the
-- deployed database (migrations run automatically on deploy).
--
-- checks.trainee_id and checks.crew_member_id are both nullable, so
-- free-standing check records (the untracked EP/PC/CA-line-check forms used
-- today) aren't touched by deleting trainees/crew_members - truncate checks
-- directly to clear those too. audit_log is cleared as well since its
-- entries only describe now-deleted test data.
TRUNCATE checks, audit_log;

-- Cascades to flights, check_to_line_forms, syllabus_progress,
-- flight_syllabus_progress, ground_school_progress, phase4_assessment via
-- existing ON DELETE CASCADE foreign keys.
DELETE FROM trainees;

DELETE FROM crew_members;

-- Safety guard: if this email doesn't match an existing user, deleting
-- "every user except this one" would delete every user, locking the
-- operator out entirely. Abort the whole migration instead.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'sam.a.moloney@gmail.com') THEN
    RAISE EXCEPTION 'Wipe aborted: no user found with email sam.a.moloney@gmail.com - refusing to delete all users';
  END IF;
END $$;

DELETE FROM users WHERE email <> 'sam.a.moloney@gmail.com';
