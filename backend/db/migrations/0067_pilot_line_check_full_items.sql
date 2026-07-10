-- Pilot Line Check (SA_490) was seeded as a minimal 4-item starter set
-- (0046) - this replaces it with the real form's full content, reviewed
-- against SA 490 Rev 2601. "Instrument approach 1/2" (generic tick +
-- approach-type dropdown) are replaced by the six named approach types the
-- real form actually lists under TERMINAL; "Emergency procedure assessed"
-- didn't correspond to anything on the real form and is dropped (EP is its
-- own separate check type). "Refresher training and check" (sort_order 0)
-- is unaffected - it's auto-computed from the crew member's Refresher
-- Training competency, not a manual item (see PilotLineCheck.jsx).
DELETE FROM check_form_items
WHERE form_key = 'PILOT_LINE_CHECK'
  AND description IN ('Instrument approach 1', 'Instrument approach 2', 'Emergency procedure assessed');

-- Pre-flight Examination
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'License and Medical certificate checked for currency and restrictions', 10),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Flight and Duty times and IFR navaid / night recency checked', 11),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Flight plan correctly compiled and flight notifications submitted', 12),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Fuel Requirements correctly determined and planned', 13),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Correct company documentation procedures applied, Maintenance docs, Operational memos, SOPs', 14),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Correct interpretation of aircraft performance data', 15),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Obtained and understood current operational information', 16),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Correctly interpreted meteorological information', 17),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Understood application of take-off minima', 18),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Determined alternate and holding requirements', 19),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Publications amended and complete', 20),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Knew aircraft equipment limits and requirements', 21),
  ('PILOT_LINE_CHECK', 'Pre-flight Examination', 'tick', 'Correct use of Load / Trim sheet', 22);

-- Narrow runway supplement only applies to Dash 8 / Metro 23 - the only
-- fleet-scoped item on this otherwise fleet-agnostic form (see
-- check-form-items.js GET's fleet filter, which now includes universal
-- rows alongside fleet-matched ones).
INSERT INTO check_form_items (form_key, fleet, section, kind, description, sort_order) VALUES
  ('PILOT_LINE_CHECK', 'DASH_8', 'Pre-flight Examination', 'tick', 'Narrow runway supplement (D8/M23 only)', 23),
  ('PILOT_LINE_CHECK', 'METRO_23', 'Pre-flight Examination', 'tick', 'Narrow runway supplement (D8/M23 only)', 23);

-- Refresher Check - alongside the existing auto-computed row
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PILOT_LINE_CHECK', 'Refresher Check', 'tick', 'Part 121 Operational Procedures', 30);

-- In-Flight Procedures and Tolerances
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PILOT_LINE_CHECK', 'In-Flight Procedures and Tolerances', 'tick', 'Aircraft fully serviceable for flight', 40),
  ('PILOT_LINE_CHECK', 'In-Flight Procedures and Tolerances', 'tick', 'Flight instruments and navaids checked before take-off', 41),
  ('PILOT_LINE_CHECK', 'In-Flight Procedures and Tolerances', 'tick', 'Crew briefing completed and appropriate', 42),
  ('PILOT_LINE_CHECK', 'In-Flight Procedures and Tolerances', 'tick', 'Correctly identified navigation aids', 43),
  ('PILOT_LINE_CHECK', 'In-Flight Procedures and Tolerances', 'tick', 'Accepted navigation procedures used', 44),
  ('PILOT_LINE_CHECK', 'In-Flight Procedures and Tolerances', 'tick', 'Flight Tolerances as per MOS Part 61 Schedule 8', 45),
  ('PILOT_LINE_CHECK', 'In-Flight Procedures and Tolerances', 'tick', 'Turbulence penetration - Demonstrated', 46),
  ('PILOT_LINE_CHECK', 'In-Flight Procedures and Tolerances', 'tick', 'Turbulence penetration - Described', 47);

-- Terminal (named approach types, replacing the old generic Instrument
-- approach 1/2 + dropdown)
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PILOT_LINE_CHECK', 'Terminal', 'tick', 'ILS Approach', 50),
  ('PILOT_LINE_CHECK', 'Terminal', 'tick', 'RNAV (GNSS) Approach', 51),
  ('PILOT_LINE_CHECK', 'Terminal', 'tick', 'VOR Approach', 52),
  ('PILOT_LINE_CHECK', 'Terminal', 'tick', 'NDB Approach', 53),
  ('PILOT_LINE_CHECK', 'Terminal', 'tick', 'LLZ Approach', 54),
  ('PILOT_LINE_CHECK', 'Terminal', 'tick', 'DME or GNSS Arrival', 55);

-- Non-Technical Skill Assessment - a plain 1-5 score per marker (no code),
-- unlike the Cabin Attendant Line Check's score+code NTS markers.
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('PILOT_LINE_CHECK', 'Non-Technical Skill Assessment', 'score', 'Communication and Teamwork', 60),
  ('PILOT_LINE_CHECK', 'Non-Technical Skill Assessment', 'score', 'Leadership and Workload Management', 61),
  ('PILOT_LINE_CHECK', 'Non-Technical Skill Assessment', 'score', 'Situational Awareness', 62),
  ('PILOT_LINE_CHECK', 'Non-Technical Skill Assessment', 'score', 'Decision Making Process', 63);
