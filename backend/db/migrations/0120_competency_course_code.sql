-- Course code moves onto the competency type itself, so a competency's name
-- and its rostering-system code live on one record and can't drift apart
-- (previously a separate label -> code list in course_codes, matched to the
-- competency's name by exact text, silently fell back to an auto-generated
-- code whenever the two were worded differently).
ALTER TABLE competency_types
  ADD COLUMN course_code TEXT CHECK (course_code IS NULL OR char_length(course_code) <= 7);

-- Which existing course_codes label belongs to which competency. First every
-- exact name match (ignoring case and surrounding spaces), then the pairs
-- whose wording differs between the two lists today.
CREATE TEMP TABLE _cc_pairs (comp_name TEXT NOT NULL, code_label TEXT NOT NULL);

INSERT INTO _cc_pairs (comp_name, code_label)
SELECT ct.name, cc.label
FROM competency_types ct
JOIN course_codes cc ON lower(btrim(cc.label)) = lower(btrim(ct.name));

INSERT INTO _cc_pairs (comp_name, code_label) VALUES
  ('3 Yearly Smoke and Fire', '3 Yearly Smoke & Fire'),
  ('Human Factors Supervisory', 'Human Factor Supervisory'),
  ('Maintenance Authority & Part 42 Training Dash 8', 'Maintenance Authority & Part 42 Training'),
  ('Maintenance Authority & Part 42 Training F100', 'Maintenance Authority & Part 42 Training'),
  ('Maintenance Authority & Part 42 Training Metro', 'Maintenance Authority & Part 42 Training'),
  ('UPRT', 'Upset Prevention and Recovery Training'),
  ('SMS Recurrent Training', 'SMS Training'),
  ('Drug & Alcohol Training', 'DAMP'),
  ('Skippers Aviation Fatigue Management', 'Fatigue Management'),
  ('Provide First Aid', 'First Aid');

UPDATE competency_types ct
SET course_code = cc.code
FROM _cc_pairs p
JOIN course_codes cc ON lower(btrim(cc.label)) = lower(btrim(p.code_label))
WHERE lower(btrim(ct.name)) = lower(btrim(p.comp_name));

-- Those course_codes rows are now fully represented on the competency itself
-- - remove them so there's only one place left to edit. Rows that did NOT
-- pair with any competency (the recurrent check labels like Emergency
-- Procedures, which aren't competencies) are left in place.
DELETE FROM course_codes cc
WHERE lower(btrim(cc.label)) IN (SELECT lower(btrim(code_label)) FROM _cc_pairs);

DROP TABLE _cc_pairs;

-- The slide-training check is labelled "F100 Slide Training" on crew
-- profiles; the old label never matched it.
UPDATE course_codes SET label = 'F100 Slide Training' WHERE label = 'Emergency Procedures Slide F100 Check';
