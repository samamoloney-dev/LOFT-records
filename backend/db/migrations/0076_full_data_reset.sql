-- Full data reset requested by the operator to start a trial with their
-- real staff instead of the dummy dataset built for demoing the app:
-- erase every staff login (except their own - see the guard below), every
-- crew member, every trainee, and every check record. Nothing else is in
-- scope - the syllabus/ground-school/check-form-item/competency-type
-- catalogs stay (templates, not records of things that happened), and so
-- does the audit log and this operator's own Meeting Minutes/Planning
-- notes content (none of that is "staff, crew or check records") - those
-- are only detached from whichever dummy staff account referenced them,
-- since that account is being deleted.
--
-- Order matters here - things must be cleared in an order that never hits
-- a dangling foreign key:
--   1. checks (cascades to check_surveys -> check_survey_responses) and
--      the two other check-record tables that live outside the checks
--      table (instructor_competency_checks, personnel_competency_checks -
--      the Ground Instructor and Personnel Air Competency SA518 checks).
--   2. trainees - cascades to flights (-> flight_syllabus_progress),
--      syllabus_progress, syllabus_category_notes, phase_completions,
--      phase4_assessments, ground_school_progress,
--      ground_school_category_notes, landing_assessment_forms,
--      check_to_line_forms.
--   3. crew_members - cascades to crew_competencies, crew_planned_checks,
--      crew_clearances.
--   4. audit_log.user_id / planning_notes.created_by /
--      meeting_minutes.created_by - all nullable with no ON DELETE clause,
--      so must be cleared before the referenced user is deleted or the
--      DELETE FROM users below would fail with a FK violation. The rows
--      themselves are kept - only the link to a since-deleted dummy
--      account is dropped.
--   5. users - guarded so a wrong/missing email can never wipe every login.
TRUNCATE checks CASCADE;
TRUNCATE instructor_competency_checks CASCADE;
TRUNCATE personnel_competency_checks CASCADE;

DELETE FROM trainees;

DELETE FROM crew_members;

UPDATE audit_log SET user_id = NULL;
UPDATE planning_notes SET created_by = NULL;
UPDATE meeting_minutes SET created_by = NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'sam.moloney@skippers.com.au') THEN
    RAISE EXCEPTION 'Wipe aborted: no user found with email sam.moloney@skippers.com.au - refusing to delete all users';
  END IF;
END $$;

DELETE FROM users WHERE email <> 'sam.moloney@skippers.com.au';
