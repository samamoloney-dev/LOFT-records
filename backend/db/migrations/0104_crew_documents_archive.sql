-- Lets an expired document be filed away (archived) rather than sitting on
-- the Needs Attention list forever once it's been dealt with (renewed
-- elsewhere, superseded, no longer needed) - mirrors the archived/
-- archived_at pattern already used throughout this app (checks,
-- crew_members, trainees, etc).
ALTER TABLE crew_documents ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE crew_documents ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX crew_documents_archived ON crew_documents (archived);
