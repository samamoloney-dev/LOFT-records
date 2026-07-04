-- Cabin crew "Required Tasks" syllabus items must be re-signed on every
-- training flight (unlike Line Training Discussion, which stays a
-- one-time list) - matches the paper record, where each flight has its
-- own copy of the required-tasks table with its own tick boxes.
CREATE TABLE flight_syllabus_progress (
  flight_id          UUID NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  syllabus_item_id   UUID NOT NULL REFERENCES syllabus_items(id) ON DELETE CASCADE,
  completed_at       TIMESTAMPTZ,
  signed_off_by      UUID REFERENCES users(id),
  signed_off_by_name TEXT,
  PRIMARY KEY (flight_id, syllabus_item_id)
);

CREATE INDEX idx_flight_syllabus_progress_flight ON flight_syllabus_progress(flight_id);

-- Trainer comments at the subject (category) level - distinct from the
-- per-topic reference notes already on syllabus_items.
CREATE TABLE syllabus_category_notes (
  trainee_id UUID NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  section    syllabus_section NOT NULL,
  notes      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trainee_id, category, section)
);
