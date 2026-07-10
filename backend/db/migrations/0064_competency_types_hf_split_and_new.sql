-- Human Factor and NTS becomes a 4-part series (renamed "...1", with "...2",
-- "...3", "...4" added alongside it) - renaming (rather than archiving and
-- adding four fresh rows) keeps every crew member's existing Human Factor
-- and NTS due/completed dates attached, since crew_competencies references
-- competency_types by id, not name.
--
-- Shift DAMP/CFIT/CPR Training/Refresher Training's sort_order up by 3 first
-- so the three new Human Factor and NTS entries can sit directly after
-- "...1" instead of at the end of the list.
UPDATE competency_types SET sort_order = sort_order + 3 WHERE name IN ('DAMP', 'CFIT', 'CPR Training', 'Refresher Training');
UPDATE competency_types SET name = 'Human Factor and NTS 1' WHERE name = 'Human Factor and NTS';

INSERT INTO competency_types (name, sort_order) VALUES
  ('Human Factor and NTS 2', 6),
  ('Human Factor and NTS 3', 7),
  ('Human Factor and NTS 4', 8);

-- Maintenance Authority and UPRT - pilot-only competencies, appended after
-- the existing catalog.
INSERT INTO competency_types (name, sort_order, applies_to) VALUES
  ('Maintenance Authority', 13, 'PILOT'),
  ('UPRT', 14, 'PILOT');
