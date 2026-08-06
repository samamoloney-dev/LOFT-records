-- Ad-hoc specialist training records for a pilot's Specialist Training tab
-- (CrewDetail.jsx) - unlike the fixed Upgrade Record/Ground Instructor/
-- Personnel (Air) Competency forms already there, this is a free-form list
-- for training that doesn't have its own dedicated form (e.g. a water
-- survival course, a manufacturer type course): just a name, an optional
-- completed date, and evidence photos attached to prove it happened, each
-- separately named (e.g. "Certificate front"). photos is a JSONB array of
-- { id, name, data } objects rather than a separate table - there's no need
-- to query into individual photos, only ever load/replace the whole list
-- for one training item at a time.
CREATE TABLE specialist_training_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  completed_date DATE,
  notes TEXT,
  photos JSONB NOT NULL DEFAULT '[]',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX specialist_training_items_crew_member_id ON specialist_training_items (crew_member_id);
