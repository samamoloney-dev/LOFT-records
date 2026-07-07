-- Admin-managed catalog of competency types (Dangerous Goods, First Aid,
-- etc.) - replaces the hardcoded 9-option dropdown previously used when
-- adding a competency to a crew member. Every active type now applies to
-- every crew member automatically (see crew.js GET /:id/competencies),
-- rather than being opted into one at a time, so there's no per-member
-- "add competency" step any more - just dates to fill in.
CREATE TABLE competency_types (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO competency_types (name, sort_order) VALUES
  ('Dangerous Goods', 0),
  ('First Aid', 1),
  ('SMS Training', 2),
  ('Fatigue Management', 3),
  ('Human Factor and NTS', 4),
  ('DAMP', 5),
  ('CFIT', 6),
  ('CPR Training', 7),
  ('Refresher Training', 8);
