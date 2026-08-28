-- Admin-editable master checklist for the Certificate Generator (see
-- frontend/src/pages/CertificateGenerator.jsx) - previously a fixed list
-- hardcoded in printBuilders.js, now managed from the Syllabus tab per the
-- operator's explicit request to add/remove courses as required. Seeded
-- with the exact list that was hardcoded before, so nothing changes for
-- existing usage until the operator actually edits it.
CREATE TABLE certificate_checklist_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL,
  sort_order INT NOT NULL,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO certificate_checklist_items (label, sort_order) VALUES
  ('Emergency Procedures Training', 0),
  ('Fokker 100 Emergency Procedures', 1),
  ('Dash 8 Emergency Procedures Training', 2),
  ('Embraer 120 Emergency Procedures Training', 3),
  ('Fairchild Metroliner 23 Emergency Procedures Training', 4),
  ('Cessna 441 Conquest Emergency Procedures Training', 5),
  ('Life Jacket Training (Wet Drill)', 6),
  ('Fokker 100 Slide Training', 7),
  ('English Language Proficiency', 8),
  ('Live Fire Fighting Exercise', 9),
  ('Smoke Fire Fighting Exercise', 10);
