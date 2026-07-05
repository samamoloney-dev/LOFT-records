-- Continuous Improvement: once an IPC/PC check is completed, the assessor
-- rates the candidate 1-5 on a bank of questions (managed by HOTC/HOFO -
-- see survey.js), so trends in weak areas can be tracked over time via a
-- bar chart of average score per question.
CREATE TABLE survey_questions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One per completed IPC/PC check - submitted_at marks it locked, matching
-- the "complete and lock" pattern used elsewhere in the app.
CREATE TABLE check_surveys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id     UUID NOT NULL UNIQUE REFERENCES checks(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE check_survey_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_survey_id UUID NOT NULL REFERENCES check_surveys(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES survey_questions(id),
  score           INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  UNIQUE (check_survey_id, question_id)
);
CREATE INDEX idx_check_survey_responses_survey ON check_survey_responses(check_survey_id);
CREATE INDEX idx_check_survey_responses_question ON check_survey_responses(question_id);
