-- Every form now carries a form number (SA###, confirmed later per form) and a
-- revision, shown on screen and on every page of its printed copy. All forms
-- start on revision 27/01; doc_ref (the instructor reference line) keeps its
-- own value.
ALTER TABLE form_reference_docs
  ADD COLUMN form_number TEXT,
  ADD COLUMN revision TEXT;
