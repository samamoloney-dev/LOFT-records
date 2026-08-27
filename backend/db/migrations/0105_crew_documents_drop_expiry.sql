-- Removed per the operator's explicit request, now that a one-off
-- competency can be assigned directly to a single crew member (see
-- crew_competencies' ad-hoc rows / the new Competencies tab) - a document
-- is now purely filed evidence of a completed competency, and the
-- competency itself carries the due date. Drops the one placeholder value
-- on file (a test date entered while building the original feature) along
-- with the column.
ALTER TABLE crew_documents DROP COLUMN expiry_date;
