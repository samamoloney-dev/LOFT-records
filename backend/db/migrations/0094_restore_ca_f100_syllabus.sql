-- Restore the SA 542 Cabin Attendant F100 Duty checklist/Discussion List
-- content - confirmed missing in production despite migration 0090 (its
-- whole-table "IF NOT EXISTS (SELECT 1 FROM syllabus_items WHERE fleet =
-- 'CA_FOKKER_100')" guard apparently short-circuited the insert somehow, or
-- something since removed every row for this fleet). Per the operator's
-- report, the trainee-level Syllabus tab now renders (see TraineeDetail.jsx)
-- but shows "No syllabus items for this fleet yet" for Fokker 100 cabin
-- attendants. Re-inserted here with a per-row guard (category+section+
-- description) instead of a single table-wide check, so this is safe to run
-- regardless of whatever partial state is actually in production. Excludes
-- the 6 "CASR 121 Conversion Training" SYLLABUS rows migration 0090
-- originally added here - those were intentionally moved to
-- ground_school_items by migration 0091 and must stay there.
INSERT INTO syllabus_items (fleet, role_scope, phase, category, section, description, notes, required)
SELECT 'CA_FOKKER_100', 'BOTH', 1, v.category, v.section, v.description, v.notes, true
FROM (VALUES
  ('Signing On', 'SYLLABUS', 'Signing on', NULL),
  ('Grooming Up To Standard', 'SYLLABUS', 'Grooming up to standard', NULL),
  ('On Time Performance', 'SYLLABUS', 'On time performance', NULL),
  ('Pre-Flight Duties', 'SYLLABUS', 'Complete pre-flight duties', 'Security Checks, Pre-flight Checklist, Crew Briefings'),
  ('Pre-Take Off Duties', 'SYLLABUS', 'Pre-take off duties (applicable to position)', 'Collect Paperwork/Escort Passengers, Correct Boarding Position, Check Boarding Passes/Welcome Pax, Deliver Welcome PA, Headcount/Close Overhead Lockers, Close FWD Pax Door/Flight Deck Door, ARM Door/Cross Check, Emergency Exit Briefs/Row 19, Safety Demonstration, Cabin Secure/Secure Galley/Toilets, Correct Cabin Secure Procedure, Brace Position & OLDABC'),
  ('In-Flight Duties', 'SYLLABUS', 'In-flight', 'Dim Lights, Cart Set Up/Deliver Service, Check on Crew/Pax/Toilet, Stock Replenishment/Tidy Galley'),
  ('Descent', 'SYLLABUS', 'Descent', 'Correct Descent Procedure Followed'),
  ('Landing/Ground Duties', 'SYLLABUS', 'Landing/ground duties', 'Taxiing in PA, Disarm Door/Cross Check, Disembark Pax, Security Checks/Cleaning Duties'),
  ('Sign Off', 'SYLLABUS', 'Sign off with trainer at end of flight', NULL),

  ('Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'Occupied the jump seat', 'Not a requirement'),
  ('Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'Discuss cabin layout and passenger seating requirements', NULL),
  ('Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'Discuss cabin lighting requirements', NULL),
  ('Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'What considerations should be made when entering the flight deck?', NULL),
  ('Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'Discuss the procedure to follow when a flight crew member is leaving the flight deck in-flight', NULL),

  ('General Procedures & Scenarios', 'DISCUSSION', 'Discuss the procedures to take when pre-departure head count is incorrect', NULL),
  ('General Procedures & Scenarios', 'DISCUSSION', 'Discuss the oven procedures (operation and precautions)', NULL),

  ('Doors & Exits', 'DISCUSSION', 'Trainee can operate the air stair door (L1) and can recall the precautions when operating', NULL),
  ('Doors & Exits', 'DISCUSSION', 'Trainee can operate the galley service door (R1) and can recall the precautions', NULL),
  ('Doors & Exits', 'DISCUSSION', 'Trainee can ARM/DISARM R1 Door and is confident with the correct procedure', NULL),
  ('Doors & Exits', 'DISCUSSION', 'Discuss the emergency operation of exits in the cabin and flight deck including the escape ropes', NULL),
  ('Doors & Exits', 'DISCUSSION', 'Trainee can recall the evacuation slide procedures (including ditching)', NULL),
  ('Doors & Exits', 'DISCUSSION', 'Trainee can recall the non-inflated slide procedures', NULL),

  ('Aircraft Systems', 'DISCUSSION', 'What toilet smoke detection systems are on the aircraft?', NULL),
  ('Aircraft Systems', 'DISCUSSION', 'What toilet fire suppression systems are on the aircraft?', NULL),
  ('Aircraft Systems', 'DISCUSSION', 'What baggage compartment smoke detection and fire suppression systems are on the aircraft?', NULL),

  ('Communication & Emergency Equipment', 'DISCUSSION', 'Discuss all Communication Signals', 'Usage of Interphone, Call Light Indicator, Different Chimes, Normal/Emergency Call, Severe Turbulence'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Emergency Lights', 'Components/Duration/Activation'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'DME Torch', 'Pre-flight Check/Location, Activation/Duration'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'ELT', 'Location/Duration/Activation'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Emergency First Aid Kit', 'Pre-flight Check/Contents/Location, What to do if you open one, SAMPLE'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Megaphone', 'Pre-flight Check/Location, Operation/Precautions'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'PBE', 'Pre-flight Checks/Location/Duration, Operation/Precautions'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Life Jackets', 'Pre-flight Checks/Location, When are they required, Exits to be used, Infant Life Jackets'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Survival Kit', 'Type/Location/Contents'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Infant / Extension Seatbelts', 'Location, Pre-flight Checks'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Halon / BCF Fire Extinguisher', 'Pre-flight Checks/Location/Duration, Operation/Precautions, Considerations with the passengers'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'P.E.D Fire Safe Bag', 'Pre-flight Checks/Location, Operation/Precautions'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Fire Fighting Drills', 'Primary/Communicator/Assist, Galley Fire, Toilet Fire, Passenger Clothing Fire, PED Fire, Waste Bin Fire, Oven Fire Drill, Post Fire Procedures'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Dangerous Goods Spill Kit', 'Location/Contents, DG Drill, Where to stow a DG Spill'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Restraints', 'Location/Contents, When/How would we use them'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Crash Axe', 'Location/what is it used for'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Quick Don & Smoke Goggles', 'Location'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Oxygen Bottles', 'Location, Pre-flight Checks/PSIs, Different types of Masks, Administration/Post Use, Precautions'),
  ('Communication & Emergency Equipment', 'DISCUSSION', 'Fixed Oxygen System', 'Location/Masks in each unit, Activation/Duration'),

  ('Emergency Procedures & Survival', 'DISCUSSION', 'Depressurisation', 'Gradual/Rapid, Drill/Follow Up Drill, Cracked Cabin Window Procedure'),
  ('Emergency Procedures & Survival', 'DISCUSSION', 'Unlawful Interference', 'Bomb Threat, Hijacking, Unruly, disruptive and violent pax'),
  ('Emergency Procedures & Survival', 'DISCUSSION', 'Emergencies/Evacuations', 'Prepared & Unprepared, PIEMAN, 10 Point Cabin Prep, Evacuation Likely/Unlikely, Evacuation Drill, Commands, Exits, Ditching'),
  ('Emergency Procedures & Survival', 'DISCUSSION', 'Survival', 'Four Priorities of Survival, HELP Position/Group Huddle'),

  ('Aviation Medicine & First Aid', 'DISCUSSION', 'Trainee can identify the Signs & Symptoms of the following conditions & the correct management', 'Dehydration, Heat Exhaustion, Hypothermia, Hypoxia/Oxygen Paradox, Chest pain, Epileptic Fit, Stroke, Nose Bleed, Hyperventilation, Allergic Reaction, Asthma Attack')
) AS v(category, section, description, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM syllabus_items si
  WHERE si.fleet = 'CA_FOKKER_100' AND si.category = v.category AND si.section = v.section AND si.description = v.description
);
