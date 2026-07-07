-- "System discussed 1/2/3" were seeded onto Pilot Line Check (0046) by
-- mistake - they belong on the pilot Check to Line form instead, alongside
-- the existing per-fleet "Aircraft System Knowledge" item (0041). Seeded as
-- kind='tick' (not 'text' like they were on Pilot Line Check) since CtlForm.jsx
-- renders every Check to Line item as a Satisfactory/Unsatisfactory/N-A tick,
-- same as the rest of that form - it has no free-text item rendering.
DELETE FROM check_form_items
WHERE form_key = 'PILOT_LINE_CHECK'
  AND description IN ('System discussed 1', 'System discussed 2', 'System discussed 3');

INSERT INTO check_form_items (form_key, fleet, section, kind, description, sort_order) VALUES
  ('CHECK_TO_LINE', 'DASH_8', 'Aircraft System Knowledge', 'tick', 'System discussed 1', 39),
  ('CHECK_TO_LINE', 'DASH_8', 'Aircraft System Knowledge', 'tick', 'System discussed 2', 40),
  ('CHECK_TO_LINE', 'DASH_8', 'Aircraft System Knowledge', 'tick', 'System discussed 3', 41),
  ('CHECK_TO_LINE', 'METRO_23', 'Aircraft System Knowledge', 'tick', 'System discussed 1', 39),
  ('CHECK_TO_LINE', 'METRO_23', 'Aircraft System Knowledge', 'tick', 'System discussed 2', 40),
  ('CHECK_TO_LINE', 'METRO_23', 'Aircraft System Knowledge', 'tick', 'System discussed 3', 41),
  ('CHECK_TO_LINE', 'FOKKER_100', 'Aircraft System Knowledge', 'tick', 'System discussed 1', 51),
  ('CHECK_TO_LINE', 'FOKKER_100', 'Aircraft System Knowledge', 'tick', 'System discussed 2', 52),
  ('CHECK_TO_LINE', 'FOKKER_100', 'Aircraft System Knowledge', 'tick', 'System discussed 3', 53);
