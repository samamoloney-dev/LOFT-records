-- SA 542 Cabin Attendant Line Training Record (Fokker 100) content -
-- syllabus items for cabin attendants converting from Dash 8 to also fly
-- Fokker 100, transcribed from the operator's SA 542 document. Mirrors
-- ca-dash8-syllabus.js's conventions for the equivalent Dash 8 record: no
-- phase gating (single phase, role_scope BOTH - cabin crew all do the same
-- duties), the per-flight Duty checklist as SYLLABUS section items, the
-- Discussion List as DISCUSSION section items. The CASR 121 Conversion
-- Training pre-training course-completion checklist (the only one of the
-- two CASR 121 tables that applies to a conversion, per the document's own
-- "Not Required for Initial Training" note) is folded in as its own
-- SYLLABUS category, since cabin attendants have no separate Ground School
-- tab to hang it off (unlike pilots).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM syllabus_items WHERE fleet = 'CA_FOKKER_100') THEN
    INSERT INTO syllabus_items (fleet, role_scope, phase, category, section, description, notes, required)
    VALUES
      ('CA_FOKKER_100', 'BOTH', 1, 'CASR 121 Conversion Training', 'SYLLABUS', 'Crew Incapacitation Training', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'CASR 121 Conversion Training', 'SYLLABUS', 'Doors & Exits', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'CASR 121 Conversion Training', 'SYLLABUS', 'Evacuation Slides', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'CASR 121 Conversion Training', 'SYLLABUS', 'Cabin Attendant Fire and Smoke Training', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'CASR 121 Conversion Training', 'SYLLABUS', 'Cabin Attendant Aircraft Systems Training', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'CASR 121 Conversion Training', 'SYLLABUS', 'Cabin Normal and Emergency Procedures Training', NULL, true),

      ('CA_FOKKER_100', 'BOTH', 1, 'Signing On', 'SYLLABUS', 'Signing on', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Grooming Up To Standard', 'SYLLABUS', 'Grooming up to standard', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'On Time Performance', 'SYLLABUS', 'On time performance', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Pre-Flight Duties', 'SYLLABUS', 'Complete pre-flight duties', 'Security Checks, Pre-flight Checklist, Crew Briefings', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Pre-Take Off Duties', 'SYLLABUS', 'Pre-take off duties (applicable to position)', 'Collect Paperwork/Escort Passengers, Correct Boarding Position, Check Boarding Passes/Welcome Pax, Deliver Welcome PA, Headcount/Close Overhead Lockers, Close FWD Pax Door/Flight Deck Door, ARM Door/Cross Check, Emergency Exit Briefs/Row 19, Safety Demonstration, Cabin Secure/Secure Galley/Toilets, Correct Cabin Secure Procedure, Brace Position & OLDABC', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'In-Flight Duties', 'SYLLABUS', 'In-flight', 'Dim Lights, Cart Set Up/Deliver Service, Check on Crew/Pax/Toilet, Stock Replenishment/Tidy Galley', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Descent', 'SYLLABUS', 'Descent', 'Correct Descent Procedure Followed', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Landing/Ground Duties', 'SYLLABUS', 'Landing/ground duties', 'Taxiing in PA, Disarm Door/Cross Check, Disembark Pax, Security Checks/Cleaning Duties', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Sign Off', 'SYLLABUS', 'Sign off with trainer at end of flight', NULL, true),

      ('CA_FOKKER_100', 'BOTH', 1, 'Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'Occupied the jump seat', 'Not a requirement', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'Discuss cabin layout and passenger seating requirements', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'Discuss cabin lighting requirements', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'What considerations should be made when entering the flight deck?', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Flight Deck & Cabin Familiarisation', 'DISCUSSION', 'Discuss the procedure to follow when a flight crew member is leaving the flight deck in-flight', NULL, true),

      ('CA_FOKKER_100', 'BOTH', 1, 'General Procedures & Scenarios', 'DISCUSSION', 'Discuss the procedures to take when pre-departure head count is incorrect', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'General Procedures & Scenarios', 'DISCUSSION', 'Discuss the oven procedures (operation and precautions)', NULL, true),

      ('CA_FOKKER_100', 'BOTH', 1, 'Doors & Exits', 'DISCUSSION', 'Trainee can operate the air stair door (L1) and can recall the precautions when operating', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Doors & Exits', 'DISCUSSION', 'Trainee can operate the galley service door (R1) and can recall the precautions', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Doors & Exits', 'DISCUSSION', 'Trainee can ARM/DISARM R1 Door and is confident with the correct procedure', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Doors & Exits', 'DISCUSSION', 'Discuss the emergency operation of exits in the cabin and flight deck including the escape ropes', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Doors & Exits', 'DISCUSSION', 'Trainee can recall the evacuation slide procedures (including ditching)', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Doors & Exits', 'DISCUSSION', 'Trainee can recall the non-inflated slide procedures', NULL, true),

      ('CA_FOKKER_100', 'BOTH', 1, 'Aircraft Systems', 'DISCUSSION', 'What toilet smoke detection systems are on the aircraft?', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Aircraft Systems', 'DISCUSSION', 'What toilet fire suppression systems are on the aircraft?', NULL, true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Aircraft Systems', 'DISCUSSION', 'What baggage compartment smoke detection and fire suppression systems are on the aircraft?', NULL, true),

      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Discuss all Communication Signals', 'Usage of Interphone, Call Light Indicator, Different Chimes, Normal/Emergency Call, Severe Turbulence', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Emergency Lights', 'Components/Duration/Activation', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'DME Torch', 'Pre-flight Check/Location, Activation/Duration', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'ELT', 'Location/Duration/Activation', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Emergency First Aid Kit', 'Pre-flight Check/Contents/Location, What to do if you open one, SAMPLE', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Megaphone', 'Pre-flight Check/Location, Operation/Precautions', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'PBE', 'Pre-flight Checks/Location/Duration, Operation/Precautions', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Life Jackets', 'Pre-flight Checks/Location, When are they required, Exits to be used, Infant Life Jackets', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Survival Kit', 'Type/Location/Contents', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Infant / Extension Seatbelts', 'Location, Pre-flight Checks', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Halon / BCF Fire Extinguisher', 'Pre-flight Checks/Location/Duration, Operation/Precautions, Considerations with the passengers', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'P.E.D Fire Safe Bag', 'Pre-flight Checks/Location, Operation/Precautions', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Fire Fighting Drills', 'Primary/Communicator/Assist, Galley Fire, Toilet Fire, Passenger Clothing Fire, PED Fire, Waste Bin Fire, Oven Fire Drill, Post Fire Procedures', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Dangerous Goods Spill Kit', 'Location/Contents, DG Drill, Where to stow a DG Spill', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Restraints', 'Location/Contents, When/How would we use them', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Crash Axe', 'Location/what is it used for', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Quick Don & Smoke Goggles', 'Location', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Oxygen Bottles', 'Location, Pre-flight Checks/PSIs, Different types of Masks, Administration/Post Use, Precautions', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Communication & Emergency Equipment', 'DISCUSSION', 'Fixed Oxygen System', 'Location/Masks in each unit, Activation/Duration', true),

      ('CA_FOKKER_100', 'BOTH', 1, 'Emergency Procedures & Survival', 'DISCUSSION', 'Depressurisation', 'Gradual/Rapid, Drill/Follow Up Drill, Cracked Cabin Window Procedure', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Emergency Procedures & Survival', 'DISCUSSION', 'Unlawful Interference', 'Bomb Threat, Hijacking, Unruly, disruptive and violent pax', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Emergency Procedures & Survival', 'DISCUSSION', 'Emergencies/Evacuations', 'Prepared & Unprepared, PIEMAN, 10 Point Cabin Prep, Evacuation Likely/Unlikely, Evacuation Drill, Commands, Exits, Ditching', true),
      ('CA_FOKKER_100', 'BOTH', 1, 'Emergency Procedures & Survival', 'DISCUSSION', 'Survival', 'Four Priorities of Survival, HELP Position/Group Huddle', true),

      ('CA_FOKKER_100', 'BOTH', 1, 'Aviation Medicine & First Aid', 'DISCUSSION', 'Trainee can identify the Signs & Symptoms of the following conditions & the correct management', 'Dehydration, Heat Exhaustion, Hypothermia, Hypoxia/Oxygen Paradox, Chest pain, Epileptic Fit, Stroke, Nose Bleed, Hyperventilation, Allergic Reaction, Asthma Attack', true);
  END IF;
END $$;
