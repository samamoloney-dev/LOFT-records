-- Phase 4 - Check to Line Preparation assessment (SA_503/SA_511/SA_811
-- "Phase 4 ASSESSMENT" form): sector log, a categorised item checklist
-- scored satisfactory/unsatisfactory/not-assessed with remarks, NTS
-- scores, comments, and a Training Captain + Applicant sign-off.
CREATE TABLE phase4_assessments (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id                 UUID NOT NULL UNIQUE REFERENCES trainees(id) ON DELETE CASCADE,
  sector_details             JSONB NOT NULL DEFAULT '{}',
  item_results               JSONB NOT NULL DEFAULT '{}',
  nts_scores                 JSONB NOT NULL DEFAULT '{}',
  comments                   TEXT,
  training_captain_signature TEXT,
  applicant_signature        TEXT,
  completed_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
