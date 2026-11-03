-- The instructor reference document number printed on each check form
-- ("Check conducted IAW specific Instructor Reference Documents DOC###").
-- A form with no row here shows the placeholder DOC### until the operator
-- confirms the real number on Edit Forms.
CREATE TABLE form_reference_docs (
  form_key   TEXT PRIMARY KEY,
  doc_ref    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
