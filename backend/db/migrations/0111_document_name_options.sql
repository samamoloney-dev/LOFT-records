-- Admin-editable dropdown list for the "Document name" field on a crew
-- member's Documents tab (see frontend/src/pages/CrewDetail.jsx
-- DocumentsTab) - previously free text, now selected from a list managed
-- here per the operator's explicit request. No seed rows - the operator
-- populates this themselves from the Syllabus tab's new Documents section.
CREATE TABLE document_name_options (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL,
  sort_order INT NOT NULL,
  archived   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
