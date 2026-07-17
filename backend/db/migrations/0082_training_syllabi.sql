-- Named alternate syllabi per fleet (e.g. "Direct Entry Captain" on the
-- Metro) - lets an admin build a wholly separate Ground School/LOFT
-- Package/Check Forms/Competencies set for a specific entry pathway
-- without disturbing the fleet's standard one. NULL syllabus_id on every
-- column added below always means "the fleet's standard syllabus" - there
-- is no row in this table representing "Standard", it's implicit, so
-- every existing item/trainee/crew member keeps working unchanged.
CREATE TABLE training_syllabi (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  fleet       fleet NOT NULL,
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ground_school_items ADD COLUMN syllabus_id UUID REFERENCES training_syllabi(id) ON DELETE CASCADE;
ALTER TABLE syllabus_items ADD COLUMN syllabus_id UUID REFERENCES training_syllabi(id) ON DELETE CASCADE;
ALTER TABLE check_form_items ADD COLUMN syllabus_id UUID REFERENCES training_syllabi(id) ON DELETE CASCADE;
ALTER TABLE competency_types ADD COLUMN syllabus_id UUID REFERENCES training_syllabi(id) ON DELETE CASCADE;

-- A trainee/crew member is assigned to a named syllabus once, at creation,
-- the same way fleet is - ON DELETE RESTRICT so an in-use syllabus can't
-- be deleted out from under whoever's on it (archive it instead).
ALTER TABLE trainees ADD COLUMN syllabus_id UUID REFERENCES training_syllabi(id) ON DELETE RESTRICT;
ALTER TABLE crew_members ADD COLUMN syllabus_id UUID REFERENCES training_syllabi(id) ON DELETE RESTRICT;

CREATE INDEX idx_ground_school_items_syllabus_id ON ground_school_items(syllabus_id);
CREATE INDEX idx_syllabus_items_syllabus_id ON syllabus_items(syllabus_id);
CREATE INDEX idx_check_form_items_syllabus_id ON check_form_items(syllabus_id);
CREATE INDEX idx_competency_types_syllabus_id ON competency_types(syllabus_id);
CREATE INDEX idx_trainees_syllabus_id ON trainees(syllabus_id);
CREATE INDEX idx_crew_members_syllabus_id ON crew_members(syllabus_id);
