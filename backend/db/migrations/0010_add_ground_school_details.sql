-- Some Ground School items need more than a tick/name/date sign-off:
-- Course items need a completed date, the Dash 8 Ground School modules
-- need a completed date and a pass mark %, and Observation Flights need
-- a date and route. Stored as a flexible JSONB blob since which fields
-- apply depends on the item's category.
ALTER TABLE ground_school_progress ADD COLUMN details JSONB NOT NULL DEFAULT '{}';

-- Pre-Simulator Assessment needs one shared notes box for the whole
-- category, not per item - same pattern as syllabus_category_notes.
CREATE TABLE ground_school_category_notes (
  trainee_id UUID NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trainee_id, category)
);
