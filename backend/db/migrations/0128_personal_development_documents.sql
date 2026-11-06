-- Personal Development evidence for every FS staff member. The same
-- staff_documents table now holds two kinds of file (EXAMINER_PROFICIENCY_CHECK
-- and PERSONAL_DEVELOPMENT). A Personal Development file records which topic it
-- covers and the date it was completed, because the topics rotate - a handful
-- of topics, each coming round again every few years.
ALTER TABLE staff_documents
  ADD COLUMN topic TEXT,
  ADD COLUMN document_date DATE;

CREATE INDEX idx_staff_documents_user_kind ON staff_documents(user_id, kind);

-- The topic list, managed on Edit Forms > Documents. Archiving a topic hides
-- it from the picker without touching files already filed under it.
CREATE TABLE personal_development_topics (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
