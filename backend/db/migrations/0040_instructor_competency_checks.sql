-- Ground Instructor Competency Check (SA_520) - a recurring (every 12
-- months) check on staff who are eligible to check/train Emergency
-- Procedures (HOTC/HOFO/Flight Ops Admin/Examiner), rather than on a crew
-- member or trainee. Modelled as its own table (not the shared "checks"
-- table, which is keyed to trainee_id/crew_member_id and has a NOT NULL
-- applies_to column that doesn't fit a staff-level check) with one row per
-- completed observation - due date is computed at read time as 365 days
-- after the most recent completed row for that user (see currency.js
-- nextDueRolling), mirroring how EP/IPC/CA Line Check recurrency works.
CREATE TABLE instructor_competency_checks (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_title             TEXT,
  date_of_observation      DATE,
  assessor_name            TEXT,
  items                    JSONB NOT NULL DEFAULT '{}',
  assessor_signature       TEXT,
  assessor_printed_name    TEXT,
  assessor_signed_date     DATE,
  instructor_signature     TEXT,
  instructor_printed_name  TEXT,
  instructor_signed_date   DATE,
  assigned_to              UUID REFERENCES users(id),
  assigned_to_name         TEXT,
  assigned_to_arn          TEXT,
  assigned_to_role         TEXT,
  completed_at             TIMESTAMPTZ,
  archived                 BOOLEAN NOT NULL DEFAULT false,
  archived_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_instructor_competency_checks_user_id ON instructor_competency_checks(user_id);
