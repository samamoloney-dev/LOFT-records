-- Competency types could only be scoped by trainee_type (applies_to) -
-- "Emergency Slide F100 & Safety Equipment" needs to be scoped to a
-- specific fleet (Fokker 100) instead, for both pilots and cabin
-- attendants on that fleet. NULL keeps the existing "applies to every
-- fleet" default. See crew.js activeCompetencies()/GET :id/competencies
-- for the matching query change.
ALTER TABLE competency_types ADD COLUMN fleets fleet[];

INSERT INTO competency_types (name, sort_order) VALUES
  ('Smoke and Firing Training', 15);

INSERT INTO competency_types (name, sort_order, applies_to) VALUES
  ('EFB Training', 16, 'PILOT');

INSERT INTO competency_types (name, sort_order, fleets) VALUES
  ('Emergency Slide F100 & Safety Equipment', 17, ARRAY['FOKKER_100', 'CA_FOKKER_100']::fleet[]);

-- Human Factor and NTS 4 (added in 0064) is no longer wanted - archived
-- rather than deleted so it can't collide with a future re-add, and any
-- crew member who already has a date entered against it keeps that history.
UPDATE competency_types SET archived = true WHERE name = 'Human Factor and NTS 4';
