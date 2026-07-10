-- Flight Standards Personnel (Air) Competency Check (SA_518) - a recurring
-- (every 24 months) check on staff who train or check pilots/cabin crew in
-- the air: Training Captain, Check Captain, CA Trainer, CA Checker (see
-- PERSONNEL_AIR_COMPETENCY_ROLES in roles.js). Examiners are deliberately
-- excluded from needing this check, per the operator's explicit request -
-- unlike the Ground Instructor Competency Check (SA_520), which does apply
-- to Examiners. Modelled the same way as instructor_competency_checks
-- (staff-level, one row per observation, not the shared "checks" table).
--
-- candidate_section records which of the form's role-specific sub-sections
-- (2a/2b/3a/3b) applied at the time of this check - fixed to what the
-- candidate's role was then, so a later role change doesn't rewrite
-- history. Section 1 (Preflight Examination) and Section 4 (Debrief) apply
-- to every check regardless of section.
CREATE TABLE personnel_competency_checks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_section     TEXT NOT NULL,
  training_check_type   TEXT,
  check_date            DATE,
  aircraft_type         TEXT,
  assessor_id           UUID REFERENCES users(id),
  assessor_name         TEXT,
  assessor_arn          TEXT,
  items                 JSONB NOT NULL DEFAULT '{}',
  comments              TEXT,
  recommendations       TEXT,
  certified_signature   TEXT,
  certified_signed_at   TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  archived              BOOLEAN NOT NULL DEFAULT false,
  archived_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_personnel_competency_checks_user_id ON personnel_competency_checks(user_id);

-- Section 1 - Preflight Examination (applies to every check)
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PERSONNEL_AIR_COMPETENCY', 'PREFLIGHT', 'tick', 'Privileges and Limitations of Approval', 0),
  ('PERSONNEL_AIR_COMPETENCY', 'PREFLIGHT', 'tick', 'Assessed Candidate''s licence / medical / logbook / training records reviewed', 1),
  ('PERSONNEL_AIR_COMPETENCY', 'PREFLIGHT', 'tick', 'Unsatisfactory performance procedures reviewed', 2);

-- 2a - Training Pilot
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_PILOT', 'tick', 'Pre-flight brief delivered with a clear aim and learning objectives', 0),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_PILOT', 'tick', 'Student''s prior knowledge assessed (revision conducted)', 1),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_PILOT', 'tick', 'Essential knowledge and underpinning theory checked', 2),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_PILOT', 'tick', 'Appropriate teaching technique selected and applied', 3),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_PILOT', 'tick', 'Accurate identification and diagnosis of student errors / faults', 4),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_PILOT', 'tick', 'Explanations were clear, concise and at an appropriate level', 5),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_PILOT', 'tick', 'Effective remedial instruction provided where required', 6),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_PILOT', 'tick', 'Realism of the training scenario maintained throughout', 7);

-- 2b - Check Pilot
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_PILOT', 'tick', 'Candidate''s documents reviewed (licence / medical / logbook / training records)', 0),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_PILOT', 'tick', 'Check format, scope and applicable standards clearly explained to candidate', 1),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_PILOT', 'tick', 'Briefing appropriate to the check type conducted', 2),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_PILOT', 'tick', 'Candidate''s performance observed without undue influence', 3),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_PILOT', 'tick', 'Accurate fault analysis and impartial assessment applied throughout', 4),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_PILOT', 'tick', 'Appropriate intervention taken when safety was at risk', 5),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_PILOT', 'tick', 'Aircraft / simulator operated safely during the check', 6);

-- 3a - Training Cabin Crew
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_CABIN_CREW', 'tick', 'Pre-brief delivered with a clear learning objective and session aim', 0),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_CABIN_CREW', 'tick', 'Student''s prior knowledge and operational experience assessed', 1),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_CABIN_CREW', 'tick', 'Essential safety and procedural knowledge checked', 2),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_CABIN_CREW', 'tick', 'Appropriate teaching method selected for the topic and student level', 3),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_CABIN_CREW', 'tick', 'Accurate identification of student performance gaps', 4),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_CABIN_CREW', 'tick', 'Clear explanations and practical demonstrations provided', 5),
  ('PERSONNEL_AIR_COMPETENCY', 'TRAINING_CABIN_CREW', 'tick', 'Effective remedial instruction given where required', 6);

-- 3b - Check Cabin Crew
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_CABIN_CREW', 'tick', 'Candidate''s records and currency reviewed prior to check', 0),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_CABIN_CREW', 'tick', 'Check format and applicable standards explained to candidate', 1),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_CABIN_CREW', 'tick', 'Briefing appropriate to the check type conducted', 2),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_CABIN_CREW', 'tick', 'Candidate''s performance observed without undue influence', 3),
  ('PERSONNEL_AIR_COMPETENCY', 'CHECK_CABIN_CREW', 'tick', 'Accurate and impartial performance assessment applied', 4);

-- Section 4 - Debrief (applies to every check)
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PERSONNEL_AIR_COMPETENCY', 'DEBRIEF', 'tick', 'Debrief conducted promptly after the session', 0),
  ('PERSONNEL_AIR_COMPETENCY', 'DEBRIEF', 'tick', 'Observations accurately reflected in the debrief', 1),
  ('PERSONNEL_AIR_COMPETENCY', 'DEBRIEF', 'tick', 'Feedback constructive - both positive and developmental areas addressed', 2),
  ('PERSONNEL_AIR_COMPETENCY', 'DEBRIEF', 'tick', 'Records completed accurately and consistent with verbal debrief', 3);
