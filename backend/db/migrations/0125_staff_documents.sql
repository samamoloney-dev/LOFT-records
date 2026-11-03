-- Files filed against an FS Staff member's own profile - first use is the
-- Examiner Proficiency Check paperwork (JPEG or PDF) for Simulator Only
-- Examiners, who aren't necessarily on the Crew roster so can't use the crew
-- Documents tab. Stored in the database like crew_documents. Nothing is ever
-- deleted from the app: "removing" a file archives it, so the record is kept.
CREATE TABLE staff_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'EXAMINER_PROFICIENCY_CHECK',
  name             TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  file_data        TEXT NOT NULL,
  archived         BOOLEAN NOT NULL DEFAULT false,
  archived_at      TIMESTAMPTZ,
  uploaded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_documents_user ON staff_documents(user_id);
