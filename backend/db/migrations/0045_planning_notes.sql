-- Freeform planning items that aren't tied to a specific recurrent check
-- type or crew member (e.g. "book Dash 8 sim slot for October") - the new
-- Planning page's third section, alongside the aggregated planned checks
-- and planned competencies that already exist per crew member.
CREATE TABLE planning_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  notes        TEXT,
  planned_date DATE,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
