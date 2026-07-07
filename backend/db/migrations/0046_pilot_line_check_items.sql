-- Pilot Line Check (SA_490) item catalog - a single generic form shared by
-- every pilot fleet (fleet left NULL, unlike the per-fleet Check to Line
-- catalog), editable from Syllabus > Check Forms > Pilot Line Check.
--
-- This is a minimal starter set, not a full transcription of SA_490 - the
-- source PDF supplied for this used a custom glyph-substitution font that
-- couldn't be read in this environment (no PDF rasteriser available to
-- view it as an image instead), so only the items explicitly described in
-- the request are seeded here. Add the rest of the real form's items
-- through the Syllabus editor.
--
-- 'Refresher training and check' is a description-matched special case in
-- PilotLineCheck.jsx - it is never manually ticked here. It's shown
-- read-only, auto-ticked from the crew member's own 'Refresher Training'
-- competency (see crew_competencies/competency_types) being current.
--
-- kind='tick_approach' additionally captures which instrument approach
-- type was flown (see check-form-items.js kind enum), for the "2
-- instrument approaches required to be flown" item.
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PILOT_LINE_CHECK', NULL, 'tick', 'Refresher training and check', 0),
  ('PILOT_LINE_CHECK', 'Aircraft Systems Knowledge', 'text', 'System discussed 1', 1),
  ('PILOT_LINE_CHECK', 'Aircraft Systems Knowledge', 'text', 'System discussed 2', 2),
  ('PILOT_LINE_CHECK', 'Aircraft Systems Knowledge', 'text', 'System discussed 3', 3),
  ('PILOT_LINE_CHECK', 'Instrument Approaches', 'tick_approach', 'Instrument approach 1', 4),
  ('PILOT_LINE_CHECK', 'Instrument Approaches', 'tick_approach', 'Instrument approach 2', 5),
  ('PILOT_LINE_CHECK', NULL, 'text', 'Emergency procedure assessed', 6);
