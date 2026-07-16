-- Seeds the Upgrade Record briefing checklists (previously hardcoded as
-- BRIEFING_ITEMS in UpgradeRecordForm.jsx) into check_form_items, using one
-- form_key per upgrade variant, so they're now editable from the Syllabus
-- tab (LOFT Package) like every other check form's item list - see
-- check-form-items.js FORM_KEYS. Seeded here in the same order/wording so
-- nothing changes for anyone using these forms today.

-- SA 507 Training Captain Upgrade Record
INSERT INTO check_form_items (form_key, kind, description, sort_order) VALUES
  ('UPGRADE_TRAINING_CAPTAIN', 'tick', 'Human Factors and Non-Technical Skills for Supervisors', 0),
  ('UPGRADE_TRAINING_CAPTAIN', 'tick', 'Assessment and grading of technical and non-technical skills', 1),
  ('UPGRADE_TRAINING_CAPTAIN', 'tick', 'Role Training including: responsibilities and duties, teaching and training methods, assessment of standards, flight safety considerations, record keeping', 2),
  ('UPGRADE_TRAINING_CAPTAIN', 'tick', 'Flight Standards Manual', 3);

-- SA 510 Check Captain Upgrade Record
INSERT INTO check_form_items (form_key, kind, description, sort_order) VALUES
  ('UPGRADE_CHECK_CAPTAIN', 'tick', 'A knowledge of relevant legislation and advisory and operational publications including the Flight Examiners Handbook', 0),
  ('UPGRADE_CHECK_CAPTAIN', 'tick', 'The application of the information contained in the Flight Standards Manual', 1),
  ('UPGRADE_CHECK_CAPTAIN', 'tick', 'Flight operations structure', 2),
  ('UPGRADE_CHECK_CAPTAIN', 'tick', 'The competencies making up technical skills', 3),
  ('UPGRADE_CHECK_CAPTAIN', 'tick', 'The conduct of training and check flights', 4),
  ('UPGRADE_CHECK_CAPTAIN', 'tick', 'Standardisation between check flight crew', 5),
  ('UPGRADE_CHECK_CAPTAIN', 'tick', 'Company training and checking administration, including: company forms, administrative processes, pass/fail criteria, repeat policy for exercises or sessions', 6);

-- SA 522 Training Cabin Attendant Upgrade Record
INSERT INTO check_form_items (form_key, kind, description, sort_order) VALUES
  ('UPGRADE_TRAINING_CABIN_ATTENDANT', 'tick', 'Human Factors and Non-Technical Skills for Supervisors', 0),
  ('UPGRADE_TRAINING_CABIN_ATTENDANT', 'tick', 'Assessment and grading of technical and non-technical skills', 1),
  ('UPGRADE_TRAINING_CABIN_ATTENDANT', 'tick', 'Role Training including: responsibilities and duties, teaching and training methods, assessment of standards, flight and cabin safety considerations, record keeping, Cabin Crew Training Manual', 2);

-- SA 523 Check Cabin Attendant Upgrade Record
INSERT INTO check_form_items (form_key, kind, description, sort_order) VALUES
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'A knowledge of relevant legislation and advisory and operational publications including cabin crew requirements', 0),
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'The application of the information contained in the Flight Standards Manual', 1),
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'Responsibilities and duties of the cabin trainer', 2),
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'Teaching and Training methods', 3),
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'The conduct of check duties', 4),
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'Assessment of standards', 5),
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'Cabin safety considerations', 6),
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'Record keeping', 7),
  ('UPGRADE_CHECK_CABIN_ATTENDANT', 'tick', 'Company training and checking administration, including: company forms, administrative processes, pass/fail criteria', 8);
