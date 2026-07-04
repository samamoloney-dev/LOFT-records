-- Ground School courses/exams a pilot trainee must complete before going
-- to the simulator for a type rating (SA_632 Pilot Training Checklist).
-- No phase or role-scope concept - it all happens before Phase 1.
CREATE TABLE ground_school_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet       fleet NOT NULL,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  notes       TEXT,
  required    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE ground_school_progress (
  trainee_id          UUID NOT NULL REFERENCES trainees(id) ON DELETE CASCADE,
  ground_school_item_id UUID NOT NULL REFERENCES ground_school_items(id) ON DELETE CASCADE,
  completed_at        TIMESTAMPTZ,
  signed_off_by       UUID REFERENCES users(id),
  signed_off_by_name  TEXT,
  PRIMARY KEY (trainee_id, ground_school_item_id)
);
