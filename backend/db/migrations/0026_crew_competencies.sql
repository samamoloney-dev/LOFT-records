-- Ad-hoc competencies (e.g. Dangerous Goods, run by an external provider)
-- attached to a crew member, tracked separately from the recurrent-check
-- currency system since these aren't fixed check types with their own
-- forms - just a name, a completion date, and a due date.

CREATE TABLE crew_competencies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  completed_date DATE,
  due_date       DATE,
  archived       BOOLEAN NOT NULL DEFAULT false,
  archived_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crew_competencies_crew_member_id ON crew_competencies(crew_member_id);
