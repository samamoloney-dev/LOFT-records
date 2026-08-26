-- Scanned certificates (Dangerous Goods, First Aid, licences, etc.) a crew
-- member holds - the operator wants to import a PDF scan per certificate and
-- view it again later from the crew profile's own new Certificates tab.
-- Stored as a base64 data URI (file_data), same pattern as licence photos/
-- specialist training photos elsewhere in this app - a separate table
-- (rather than a column on crew_members) since a crew member can hold
-- several of these, unlike the single licence photo.
CREATE TABLE crew_certificates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id   UUID NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  file_data        TEXT NOT NULL,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX crew_certificates_crew_member_id ON crew_certificates (crew_member_id);
