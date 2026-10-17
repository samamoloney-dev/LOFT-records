-- "3 Yearly Smoke & Fire" (a competency with hand-entered dates) and the
-- Smoke & Fire Training check (the form-based record) are the same thing, per
-- the operator. The check is kept as the single record - every crew member
-- with a competency date already has a Smoke & Fire check at least as recent -
-- and the duplicate competency is archived (not deleted), so its past dates
-- stay on file but it no longer appears or exports.
UPDATE competency_types SET archived = true WHERE name = '3 Yearly Smoke & Fire';

-- Export codes: the merged item takes the spreadsheet's code, and the two
-- staff-level competencies (tracked on FS Staff, not the Crew roster) get
-- theirs. Loaded only where not already present.
INSERT INTO course_codes (label, code, sort_order)
SELECT v.label, v.code, (SELECT COALESCE(MAX(sort_order), -1) FROM course_codes) + v.n
FROM (VALUES
  (1, '3 Yearly Smoke & Fire', '3YS&F'),
  (2, 'Competency of Ground Instructor', 'GRNDASS'),
  (3, 'Flight Standards Personnel Competency Check - Pilot', 'FSPCCP'),
  (4, 'Flight Standards Personnel Competency Check - Cabin', 'FSPCCC')
) AS v(n, label, code)
WHERE NOT EXISTS (SELECT 1 FROM course_codes cc WHERE cc.label = v.label);
