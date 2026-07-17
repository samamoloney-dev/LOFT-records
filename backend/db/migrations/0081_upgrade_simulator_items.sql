-- SA 507 Training Captain Upgrade Record's FSM E5.2.3 page - required
-- simulator training (General Handling, then Simulated Control Difficulty,
-- minimum of 3) - editable from the Syllabus tab like every other check
-- form item list, see check-form-items.js's UPGRADE_TRAINING_CAPTAIN_SIMULATOR
-- form key. Training Captain upgrade only - no equivalent page on the
-- Check Captain/Cabin Attendant upgrade forms.
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('UPGRADE_TRAINING_CAPTAIN_SIMULATOR', 'General Handling', 'tick', 'Medium and Steep Turns', 0),
  ('UPGRADE_TRAINING_CAPTAIN_SIMULATOR', 'General Handling', 'tick', 'Take-off and Landing (a minimum of 3)', 1),
  ('UPGRADE_TRAINING_CAPTAIN_SIMULATOR', 'General Handling', 'tick', 'Flight with one engine inoperative after take-off, during cruise, approach, go-around and landing (a minimum of 2 x EFATO is required)', 2),
  ('UPGRADE_TRAINING_CAPTAIN_SIMULATOR', 'General Handling', 'tick', 'Take-offs and landings at night (a minimum of 3)', 3),
  ('UPGRADE_TRAINING_CAPTAIN_SIMULATOR', 'Simulated Control Difficulty (minimum of 3)', 'tick', 'Incorrect Control Inputs', 4),
  ('UPGRADE_TRAINING_CAPTAIN_SIMULATOR', 'Simulated Control Difficulty (minimum of 3)', 'tick', 'Incorrect Technique During Take-off and Landing', 5),
  ('UPGRADE_TRAINING_CAPTAIN_SIMULATOR', 'Simulated Control Difficulty (minimum of 3)', 'tick', 'Incorrect Control Manipulation', 6);
