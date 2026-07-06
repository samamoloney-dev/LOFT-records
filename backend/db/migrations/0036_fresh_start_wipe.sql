-- Fresh-start wipe requested by the operator: clears all staff logins
-- (except their own, so nobody gets locked out - there's no
-- self-registration route, only an already-logged-in admin can create a
-- new staff account) and all checks, plus everything that hangs off a
-- check or crew/trainee record so nothing is left dangling:
--   - check_surveys / check_survey_responses (Continuous Improvement
--     survey data) cascade away with checks - see
--     0033_continuous_improvement_survey.sql's ON DELETE CASCADE.
--   - trainees cascades to flights, check_to_line_forms,
--     syllabus_progress, flight_syllabus_progress, ground_school_progress,
--     phase4_assessment, landing_assessment_forms.
--   - crew_members cascades to crew_competencies, crew_planned_checks.
-- Question banks and admin config (survey_questions, syllabus_items,
-- ground_school_items, fstd_presets) are left alone - those are templates,
-- not records of things that happened.
--
-- Deliberately a data migration, not a schema change - this is the only
-- mechanism available to run a one-off statement against the deployed
-- database (migrations run automatically on deploy).
--
-- checks now has a dependent table (check_surveys) with a foreign key
-- pointing at it, so this TRUNCATE needs CASCADE this time - a plain
-- TRUNCATE would be refused (see 0019_wipe_non_admin_data.sql for the
-- pre-Continuous-Improvement version of this same wipe).
TRUNCATE checks, audit_log CASCADE;

DELETE FROM trainees;

DELETE FROM crew_members;

-- Safety guard: if this email doesn't match an existing user, deleting
-- "every user except this one" would delete every user, locking everyone
-- out entirely. Abort the whole migration instead.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'sam.moloney@skippers.com.au') THEN
    RAISE EXCEPTION 'Wipe aborted: no user found with email sam.moloney@skippers.com.au - refusing to delete all users';
  END IF;
END $$;

DELETE FROM users WHERE email <> 'sam.moloney@skippers.com.au';
