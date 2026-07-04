-- Syllabus items need to be grouped into named sections (Flight Planning,
-- Pre-Departure, System Reviews, Line Training Discussion topics, etc.) to
-- match the real Dash 8 Line Training Record, and split into two top-level
-- tabs: the skill/knowledge syllabus itself, and the Line Training
-- Discussion Q&A items.
CREATE TYPE syllabus_section AS ENUM ('SYLLABUS', 'DISCUSSION');

ALTER TABLE syllabus_items ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
ALTER TABLE syllabus_items ADD COLUMN section syllabus_section NOT NULL DEFAULT 'SYLLABUS';
ALTER TABLE syllabus_items ADD COLUMN notes TEXT;

-- Completing a phase is a distinct, signable event (Training Captain +
-- Applicant both sign), not just "every item in the phase is ticked" - and
-- it's what actually advances the trainee to the next phase.
CREATE TABLE phase_completions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id                 UUID NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  phase                      INTEGER NOT NULL,
  training_captain_signature TEXT,
  applicant_signature        TEXT,
  completed_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trainee_id, phase)
);

CREATE INDEX idx_phase_completions_trainee ON phase_completions(trainee_id);
