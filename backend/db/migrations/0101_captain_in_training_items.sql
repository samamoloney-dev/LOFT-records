-- Captain in Training Preliminary/Final Assessment (SA 567/568) item
-- catalogue - previously hardcoded in CaptainInTrainingForm.jsx and
-- printBuilders.js, now admin-editable from Syllabus > Check Forms like
-- every other check type. kind distinguishes the three answer styles this
-- form uses: 'observation' (a Developing/Adequate/Strong rating plus a
-- Yes/No minimum-standard flag), 'yesno' (plain Yes/No), and
-- 'satisfactory' (Satisfactory/Unsatisfactory) - all three also take an
-- optional free-text comment. Seeded here in the same order as the
-- previous hardcoded lists so nothing changes for anyone using these forms
-- today.
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 1: Basic Aircraft Handling — LHS Introduction', 'observation', 'Comfort and orientation in LHS', 0),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 1: Basic Aircraft Handling — LHS Introduction', 'observation', 'Cockpit setup', 1),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 1: Basic Aircraft Handling — LHS Introduction', 'observation', 'Engine Start Process', 2),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 1: Basic Aircraft Handling — LHS Introduction', 'observation', 'Correct Use of Checklist', 3),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 1: Basic Aircraft Handling — LHS Introduction', 'observation', 'Overall Aircraft Handling', 4),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 1: Basic Aircraft Handling — LHS Introduction', 'observation', 'Proficiency Check Test Specific Activities and Maneuvers', 5),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 2: Early Command Aptitude Indicators', 'yesno', 'Shows awareness of crew roles and responsibilities', 6),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 2: Early Command Aptitude Indicators', 'yesno', 'Demonstrates a safety-first mindset', 7),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 2: Early Command Aptitude Indicators', 'yesno', 'Communicates intentions (even if not fluent)', 8),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 2: Early Command Aptitude Indicators', 'yesno', 'Acknowledges when unsure and seeks clarification', 9),
  ('CAPTAIN_IN_TRAINING_PRELIMINARY', 'Section 2: Early Command Aptitude Indicators', 'yesno', 'Receptive to feedback from trainer/FO', 10);

INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 1: Flight Performance & Handling', 'satisfactory', 'Aircraft control and handling', 0),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 1: Flight Performance & Handling', 'satisfactory', 'Adherence to SOP''s and checklists', 1),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 1: Flight Performance & Handling', 'satisfactory', 'Decision making', 2),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 1: Flight Performance & Handling', 'satisfactory', 'Recognition of stable approach criteria', 3),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 1: Flight Performance & Handling', 'satisfactory', 'Decision to land or go around', 4),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 2: Flight Management & Situational Awareness', 'satisfactory', 'Task prioritisation and workload management', 5),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 2: Flight Management & Situational Awareness', 'satisfactory', 'Monitoring and cross-checking', 6),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 2: Flight Management & Situational Awareness', 'satisfactory', 'Adherence to company policies and regulations', 7),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 2: Flight Management & Situational Awareness', 'satisfactory', 'Situational awareness and risk assessment', 8),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 2: Flight Management & Situational Awareness', 'satisfactory', 'Decision to take over from First Officer when necessary', 9),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Communication with crew and ATC', 10),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Leadership and command presence', 11),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Crew coordination and delegation', 12),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Use of standard phraseology and briefing quality', 13),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Recognition and mitigation of operational threats', 14),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Fatigue and stress management', 15),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Handling of unexpected or abnormal situations', 16),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Decision making under pressure', 17),
  ('CAPTAIN_IN_TRAINING_FINAL', 'Section 3: Human Factors & Non-Technical Skills', 'satisfactory', 'Assertiveness and intervention when required', 18);
