-- Lets HOTC/HOFO/Flight Ops Admin record a planned date for an upcoming
-- recurrent check or competency renewal, distinct from the computed due
-- date - visible on Currency Overview as "planned for" rather than an
-- actual completion.
CREATE TABLE crew_planned_checks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  check_key      TEXT NOT NULL,
  planned_date   DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crew_member_id, check_key)
);
CREATE INDEX idx_crew_planned_checks_member ON crew_planned_checks(crew_member_id);

ALTER TABLE crew_competencies ADD COLUMN planned_date DATE;
