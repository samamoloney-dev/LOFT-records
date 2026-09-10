-- Admin-editable label -> course code mapping for the Currency Overview CSV
-- export's "Competency Code" column (see frontend/src/pages/CurrencyOverview.jsx
-- codeFor/COMPETENCY_CODE_MAP) - used as the join key on the rostering
-- system's side, previously hardcoded in source. Seeded with the exact
-- existing map so the rostering integration sees no change on cutover; any
-- label not listed here still falls back to CurrencyOverview.jsx's own
-- deterministic auto-generated code, unchanged.
CREATE TABLE course_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL,
  code       TEXT NOT NULL CHECK (char_length(code) <= 7),
  sort_order INT NOT NULL,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO course_codes (label, code, sort_order) VALUES
  ('Emergency Procedures', 'EMERPRC', 0),
  ('IPC', 'IPCHECK', 1),
  ('Proficiency Check', 'PROFCHK', 2),
  ('Line Check', 'LINECHK', 3),
  ('Cabin Attendant Line Check', 'CALNCHK', 4),
  ('Medical', 'MEDICAL', 5),
  ('Refresher Training', 'REFRESH', 6),
  ('Dangerous Goods', 'DANGGDS', 7),
  ('First Aid', 'FIRSTAD', 8),
  ('SMS Training', 'SMSTRNG', 9),
  ('Fatigue Management', 'FATIGMT', 10),
  ('Human Factor and NTS', 'HUMFCTR', 11),
  ('Human Factor and NTS 2', 'HUMFCT2', 12),
  ('Human Factor and NTS 3', 'HUMFCT3', 13),
  ('Human Factor and NTS 4', 'HUMFCT4', 14),
  ('DAMP', 'DAMPPGM', 15),
  ('CFIT', 'CFITAWR', 16),
  ('CPR Training', 'CPRTRNG', 17),
  ('Smoke and Firing Training', 'SMKFIRE', 18),
  ('EFB Training', 'EFBTRNG', 19),
  ('Emergency Slide F100 & Safety Equipment', 'ESLIDF1', 20),
  ('Maintenance Authority', 'MAINTAU', 21),
  ('UPRT', 'UPRTRNG', 22),
  ('Right Hand Seat', 'RGHTHND', 23);
