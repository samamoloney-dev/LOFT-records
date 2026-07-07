-- Admin-editable catalog of check form items - so the item lists on the
-- Emergency Procedures, Proficiency Check/IPC and Cabin Attendant Line
-- Check forms can be edited from the Syllabus tab instead of being fixed
-- in source code. kind distinguishes a plain tick (S/X/N) item from the
-- Cabin Attendant Line Check's NTS markers, which take a score+code pair
-- instead. ipc_only marks items that only appear on the IPC and
-- Proficiency Check variant, not the plain Proficiency Check. Seeded here
-- from the previously hardcoded item lists (EP_ITEMS, CA_CHECK_ITEMS,
-- CA_NTS_MARKERS, RECURRENT_TRAINING_ITEMS, KNOWLEDGE_ITEMS,
-- FLIGHT_COMPONENT_SECTIONS), in the same order, so nothing changes for
-- anyone using these forms today.
CREATE TABLE check_form_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key    TEXT NOT NULL,
  section     TEXT,
  kind        TEXT NOT NULL DEFAULT 'tick',
  description TEXT NOT NULL,
  mos         TEXT,
  ipc_only    BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_check_form_items_form_key ON check_form_items(form_key);

-- Emergency Procedures (EP_ITEMS)
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('EMERGENCY_PROCEDURES', NULL, 'tick', 'Emergency Equipment Knowledge — location, duration, operation, precaution and post use', 0),
  ('EMERGENCY_PROCEDURES', NULL, 'tick', 'Emergency Equipment Practical Demonstration', 1),
  ('EMERGENCY_PROCEDURES', NULL, 'tick', 'Emergency Evacuation Procedures', 2),
  ('EMERGENCY_PROCEDURES', NULL, 'tick', 'Emergency Evacuation Procedures Practical Demonstration', 3),
  ('EMERGENCY_PROCEDURES', NULL, 'tick', 'Emergency Exit Operation', 4),
  ('EMERGENCY_PROCEDURES', NULL, 'tick', 'Survival Knowledge', 5),
  ('EMERGENCY_PROCEDURES', NULL, 'tick', 'Unlawful Interference', 6),
  ('EMERGENCY_PROCEDURES', NULL, 'tick', 'Emergency Escape Slide', 7);

-- Cabin Attendant Line Check (CA_CHECK_ITEMS)
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'Personal Presentation', 0),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'On Time Performance', 1),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'Pre Flight Duties and Pre Flight Checks', 2),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'Pre Embarkation and Passenger Boarding', 3),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'Passenger Briefings and Passenger Announcements', 4),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'In-Flight Service', 5),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'Management and Communication', 6),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'Post Flight Duties', 7),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'General Knowledge of Skippers Regulations', 8),
  ('CABIN_ATTENDANT_LINE_CHECK', NULL, 'tick', 'Knowledge of how to manage Restricted, Unruly and Passengers with reduced mobility', 9);

-- Cabin Attendant Line Check NTS markers (CA_NTS_MARKERS) - score+code pair, not a tick
INSERT INTO check_form_items (form_key, section, kind, description, sort_order) VALUES
  ('CABIN_ATTENDANT_LINE_CHECK', 'NTS Markers', 'score_code', 'Communication and Teamwork', 10),
  ('CABIN_ATTENDANT_LINE_CHECK', 'NTS Markers', 'score_code', 'Leadership and Workload Management', 11),
  ('CABIN_ATTENDANT_LINE_CHECK', 'NTS Markers', 'score_code', 'Situational Awareness', 12),
  ('CABIN_ATTENDANT_LINE_CHECK', 'NTS Markers', 'score_code', 'Decision Making Process', 13);

-- Proficiency Check / IPC and Proficiency Check - Recurrent Training (RECURRENT_TRAINING_ITEMS)
INSERT INTO check_form_items (form_key, section, kind, description, mos, sort_order) VALUES
  ('PROFICIENCY_CHECK', 'Recurrent Training (121.50 (1B))', 'tick', 'UPRT (N/A M23) Upset Awareness', '121.12 20(4a)', 0),
  ('PROFICIENCY_CHECK', 'Recurrent Training (121.50 (1B))', 'tick', 'UPRT (N/A M23) Upset Prevention', '121.12 20(4b)', 1),
  ('PROFICIENCY_CHECK', 'Recurrent Training (121.50 (1B))', 'tick', 'UPRT (N/A M23) Upset Recovery', '121.12 20(4c)', 2),
  ('PROFICIENCY_CHECK', 'Recurrent Training (121.50 (1B))', 'tick', 'Major System Failure - As per Recurrent Training Manual', '121.12 20(5)', 3),
  ('PROFICIENCY_CHECK', 'Recurrent Training (121.50 (1B))', 'tick', 'System failure with checklist procedure (Refer Major System)', '121.12 20(5)', 4);

-- Knowledge requirements (Ground Component, Sch.5) - IPC and Proficiency Check only (KNOWLEDGE_ITEMS)
INSERT INTO check_form_items (form_key, section, kind, description, mos, ipc_only, sort_order) VALUES
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Privileges and limitations of the instrument rating and each endorsement assessed', '2(a)', true, 5),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Proficiency check requirements', '2(b)', true, 6),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'IFR flight and approach recency requirements', '2(c)', true, 7),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Aircraft instrument requirements', '2(d)', true, 8),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Interpreting operational and meteorological information', '2(e)', true, 9),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Take-off minima', '2(f)', true, 10),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Holding and alternate requirements', '2(g)', true, 11),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'IFR procedures for all airspace classifications', '2(h)', true, 12),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Departure and approach instrument procedures', '2(i)', true, 13),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Operations below LSALT and MSA for day and night operations', '2(j)', true, 14),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'GNSS and PBN standards', '2(k)', true, 15),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Circling approaches (N/A for SIM)', '2(l)', true, 16),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'Adverse weather operations', '2(m)', true, 17),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'ERSA normal and emergency procedures', '2(n)', true, 18),
  ('PROFICIENCY_CHECK', 'Knowledge requirements (Ground Component)', 'tick', 'IFR Planning', '2(o)', true, 19);

-- Flight Component (Sch.2) - shared by both forms, ipc_only items are additional for IPC and Proficiency Check
INSERT INTO check_form_items (form_key, section, kind, description, mos, ipc_only, sort_order) VALUES
  ('PROFICIENCY_CHECK', '3.1 Pre-flight', 'tick', 'Plan an IFR flight', 'CIR.1', false, 20),
  ('PROFICIENCY_CHECK', '3.1 Pre-flight', 'tick', 'Perform pre-flight actions and procedures', 'C2.1, C4.1', false, 21),

  ('PROFICIENCY_CHECK', '3.2 Ground ops, take-off, departure and climb', 'tick', 'Complete all relevant checks and procedures', 'CIR.1, IFF.1', false, 22),
  ('PROFICIENCY_CHECK', '3.2 Ground ops, take-off, departure and climb', 'tick', 'Plan, brief and conduct take-off and departure procedures', 'CIR.2', false, 23),
  ('PROFICIENCY_CHECK', '3.2 Ground ops, take-off, departure and climb', 'tick', 'Conduct instrument departure - published if available or ATC cleared if available', 'CIR.3 or CIR.4', false, 24),
  ('PROFICIENCY_CHECK', '3.2 Ground ops, take-off, departure and climb', 'tick', 'Rejected Take-Off (PIC only)', '121.12.22', false, 25),

  ('PROFICIENCY_CHECK', '3.3 En route cruise', 'tick', 'Navigate aircraft en route using ground and satellite navigation systems', 'CIR.5', false, 26),
  ('PROFICIENCY_CHECK', '3.3 En route cruise', 'tick', 'Perform Navigation systems integrity checks', 'CIR.5', false, 27),
  ('PROFICIENCY_CHECK', '3.3 En route cruise', 'tick', 'Identify and avoid hazardous weather conditions', 'CIR.5', false, 28),

  ('PROFICIENCY_CHECK', '3.4 Test specific activities and manoeuvres', 'tick', 'Perform full and limited panel instrument flying', 'IFF.2, IFL.1, IFL.2', true, 29),
  ('PROFICIENCY_CHECK', '3.4 Test specific activities and manoeuvres', 'tick', 'Using full and limited instrument panels, recover from at least 2 unusual attitudes', 'IFF.3, IFL.3', true, 30),
  ('PROFICIENCY_CHECK', '3.4 Test specific activities and manoeuvres', 'tick', 'Conduct instrument departure OEI - FAIL V1 - V2', 'CIR.4, 121.12.22', false, 31),
  ('PROFICIENCY_CHECK', '3.4 Test specific activities and manoeuvres', 'tick', 'Conduct instrument approach OEI - 3D', 'CIR.9, 121.12.22', false, 32),
  ('PROFICIENCY_CHECK', '3.4 Test specific activities and manoeuvres', 'tick', 'Conduct instrument missed approach OEI from minima', 'CIR.9, CIR.10, 121.12.22', false, 33),
  ('PROFICIENCY_CHECK', '3.4 Test specific activities and manoeuvres', 'tick', 'OEI Landing', '121.12.22', false, 34),
  ('PROFICIENCY_CHECK', '3.4 Test specific activities and manoeuvres', 'tick', 'TCAS', '121.12.22', false, 35),

  ('PROFICIENCY_CHECK', '3.5 Descent and arrival', 'tick', 'Perform a descent or published arrival procedure to an aerodrome', 'CIR.6', false, 36),
  ('PROFICIENCY_CHECK', '3.5 Descent and arrival', 'tick', 'Track to holding fix and conduct a holding pattern or sector 3 procedure', 'CIR.7, IAP2.3', false, 37),
  ('PROFICIENCY_CHECK', '3.5 Descent and arrival', 'tick', '2D, prepare for approach', 'IAP2.1, IAP2.2', false, 38),
  ('PROFICIENCY_CHECK', '3.5 Descent and arrival', 'tick', '2D, conduct approach', 'IAP3.1, IAP3.2, 121.12.22', false, 39),
  ('PROFICIENCY_CHECK', '3.5 Descent and arrival', 'tick', '3D, prepare for approach', 'CIR.8, IAP3.4, 121.12.22', false, 40),
  ('PROFICIENCY_CHECK', '3.5 Descent and arrival', 'tick', '3D, conduct approach', 'IAP2.5 or IAP3.5', false, 41),
  ('PROFICIENCY_CHECK', '3.5 Descent and arrival', 'tick', 'Conduct missed approach', 'CIR.7', false, 42),

  ('PROFICIENCY_CHECK', '3.6 Circuit, approach and landing', 'tick', 'Perform after-landing actions and procedures', 'A4.1', false, 43),

  ('PROFICIENCY_CHECK', '3.7 Shut down and post-flight', 'tick', 'Park, shut down secure aircraft and complete post-flight administration', 'C2.3', false, 44),

  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Maintain effective lookout', 'NTS1.1', false, 45),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Maintain situational awareness', 'NTS1.2', false, 46),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Assess situations and make decisions', 'NTS1.3', false, 47),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Set priorities and manage tasks', 'NTS1.4', false, 48),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Maintain effective communications and interpersonal relationships', 'NTS1.5', false, 49),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Recognise and manage threats', 'NTS2.1', false, 50),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Recognise and manage errors', 'NTS2.2', false, 51),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Recognise and manage undesired states', 'NTS2.3', false, 52),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Use correct radio procedures', 'CIR', false, 53),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Manage relevant aircraft systems', 'CIR', false, 54),
  ('PROFICIENCY_CHECK', '3.8 General requirements', 'tick', 'Manage fuel system and monitor fuel plan and usage', 'CIR.5', false, 55);
