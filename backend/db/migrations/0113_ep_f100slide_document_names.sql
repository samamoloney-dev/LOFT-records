-- The two document names newly needed for auto-filed certificates (see
-- backend/src/lib/autoCertificate.js) - "Wet Drill Training" and "3 Yearly
-- Smoke & Fire" already exist from earlier work, these are the missing two.
INSERT INTO document_name_options (label, sort_order)
SELECT 'Emergency Procedures', COALESCE(MAX(sort_order), -1) + 1 FROM document_name_options;

INSERT INTO document_name_options (label, sort_order)
SELECT 'F100 Slide Training', COALESCE(MAX(sort_order), -1) + 1 FROM document_name_options;
