// Cabin Crew Dash 8 Line Training Record, transcribed from
// SA_541_DASH_8_CABIN_CREW_LINE_TRAINING_RECORD. All items are fleet:
// CA_DASH_8.
//
// Unlike the pilot records, this document has no phase structure - each
// "Required Task" category is demonstrated cumulatively across a run of
// training flights (Dash 8-300 flights one through eight, then Dash 8-100
// flights one and two) and signed off once competency is shown, not once
// per flight. So every item here is phase 1 (single phase, no gating) and
// role_scope BOTH (all cabin attendants do the same duties). Where wording
// differs between the -100 and -300 variant, both are captured in notes.

const { SYLLABUS, DISCUSSION, BOTH, item } = require('./syllabus-helpers');

const items = [
  // Signing On
  item('Signing On', BOTH, 1, 'How to sign on'),
  item('Signing On', BOTH, 1, 'Check passenger manifest'),
  item('Signing On', BOTH, 1, 'Check in-tray & white board'),
  item('Signing On', BOTH, 1, 'Correct PPE worn / ramp awareness'),

  // Presentation & Punctuality
  item('Presentation & Punctuality', BOTH, 1, 'Grooming up to standard'),
  item('Presentation & Punctuality', BOTH, 1, 'On time performance'),

  // Pre-Flight Duties
  item('Pre-Flight Duties', BOTH, 1, 'Security checks'),
  item('Pre-Flight Duties', BOTH, 1, 'Pre-flight checklist'),
  item('Pre-Flight Duties', BOTH, 1, 'CA briefing'),
  item('Pre-Flight Duties', BOTH, 1, 'Brief with flight crew'),
  item('Pre-Flight Duties', BOTH, 1, 'Report to terminal'),

  // Pre-Departure Duties
  item('Pre-Departure Duties', BOTH, 1, 'Collect paperwork', 'Hand paperwork to flight crew on Dash 8-100'),
  item('Pre-Departure Duties', BOTH, 1, 'Escort passengers'),
  item('Pre-Departure Duties', BOTH, 1, 'Welcome passengers / check boarding passes'),
  item('Pre-Departure Duties', BOTH, 1, 'Announce welcome PA'),
  item('Pre-Departure Duties', BOTH, 1, 'Conduct headcount / close overhead lockers'),
  item('Pre-Departure Duties', BOTH, 1, 'Close FD door / FWD pax door'),
  item('Pre-Departure Duties', BOTH, 1, 'Emergency exit brief', 'Row 1 & 10 on Dash 8-300, Row 1 & 4 on Dash 8-100'),
  item('Pre-Departure Duties', BOTH, 1, 'Announce safety PA / safety demonstration'),
  item('Pre-Departure Duties', BOTH, 1, 'Secure cabin & galley'),
  item('Pre-Departure Duties', BOTH, 1, 'Secure area of responsibility'),
  item('Pre-Departure Duties', BOTH, 1, 'Correct cabin secure procedure / call cabin secure'),
  item('Pre-Departure Duties', BOTH, 1, 'Brace position & OLDABC'),

  // In-Flight Duties
  item('In-Flight Duties', BOTH, 1, 'Dim the cabin lights'),
  item('In-Flight Duties', BOTH, 1, 'Conduct service', 'Tray/coffee card service on Dash 8-100'),
  item('In-Flight Duties', BOTH, 1, 'Check on flight crew/passengers/toilet', 'Every 20 minutes on Dash 8-100'),
  item('In-Flight Duties', BOTH, 1, 'Complete stock form (return sector)'),

  // Descent
  item('Descent', BOTH, 1, 'Announce descent PA'),
  item('Descent', BOTH, 1, 'Secure area of responsibility'),
  item('Descent', BOTH, 1, 'Correct cabin secure procedure'),
  item('Descent', BOTH, 1, 'Advise CA1 cabin secure'),

  // Landing
  item('Landing', BOTH, 1, 'Announce taxiing-in PA'),

  // Ground Duties
  item('Ground Duties', BOTH, 1, 'Advise Captain when all passengers are off'),
  item('Ground Duties', BOTH, 1, 'Escort passengers to terminal / close the gate'),
  item('Ground Duties', BOTH, 1, 'Complete security checks'),
  item('Ground Duties', BOTH, 1, 'Cleaning duties'),

  // Sign Off
  item('Sign Off', BOTH, 1, 'Sign off with trainer at end of flight'),

  // --- Line Training Discussion ---

  // Facility & Office Familiarisation
  item('Facility & Office Familiarisation', BOTH, 1, 'Shown company facilities', 'Flight Crew Room, Terminal Dispatch Office, Ramp Room, Stores, Operations/CA Manager’s office', DISCUSSION),
  item('Facility & Office Familiarisation', BOTH, 1, 'Shown administrative systems', 'Internal Emailing, AVSAFE Reporting, CA Meeting Minutes, Memo Acknowledgement, Leave Application/Enquiry, Forms on AvBase', DISCUSSION),

  // Rostering & Administration
  item('Rostering & Administration', BOTH, 1, 'Understands roster duties/requirements', 'When to check Roster (after 4.30pm), 12-hour Duty, Split Double, Standby/Airport Standby', DISCUSSION),
  item('Rostering & Administration', BOTH, 1, 'Trainee has One Drive set up on device', null, DISCUSSION),
  item('Rostering & Administration', BOTH, 1, 'Discuss when and how to call Operations if unfit for duty, including after hours', null, DISCUSSION),

  // Operational Experience
  item('Operational Experience', BOTH, 1, 'Complete an RPT flight; discuss differences between RPT/Charter', null, DISCUSSION),
  item('Operational Experience', BOTH, 1, 'Complete or discuss an all-day duty', null, DISCUSSION),
  item('Operational Experience', BOTH, 1, 'Complete a multi-sector/transit flight', null, DISCUSSION),
  item('Operational Experience', BOTH, 1, 'Complete or discuss a cross-hire flight', null, DISCUSSION),
  item('Operational Experience', BOTH, 1, 'Complete or discuss Life Jacket Demonstration', null, DISCUSSION),
  item('Operational Experience', BOTH, 1, 'Occupied the jump seat', 'Not a requirement', DISCUSSION),

  // General Procedures & Scenarios
  item('General Procedures & Scenarios', BOTH, 1, 'What do you do if a passenger leaves lost property on board an aircraft?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What information needs to be checked on a passenger boarding pass?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'Discuss the procedure when a pre-departure head count is incorrect', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'Discuss procedure when faced with an intoxicated passenger', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'Discuss a static take-off and rolling take-off', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'Discuss a single engine turnaround and the procedures that follow', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'Discuss aircraft swaps & delays', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'Discuss all additional PAs', 'Divert mid-flight, transit, turbulence, medical assistance etc', DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'Confirm when and how to call Cabin Secure', 'Dash 100 & 300', DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'How often do we need to check on passengers/crew/toilet?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What procedures are to be followed when a pilot requests to leave the flight deck?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What considerations should be made when entering the flight deck?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What do you do if you notice a tripped circuit breaker?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What procedures are to be followed when using hot water, urns and coffee machines?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'When would you report any abnormal events/cabin defects?', 'Discuss MEL', DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What is the DG Challenge and when would we be required to do it?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What is a False Statement Brief and what are your duties?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'How is the cabin temperature controlled?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What is Standard Seating? How and when would you be required to do this?', null, DISCUSSION),
  item('General Procedures & Scenarios', BOTH, 1, 'What are some galley differences in the fleet?', 'Discuss XKI/XKJ hot water system', DISCUSSION),

  // Aircraft Systems
  item('Aircraft Systems', BOTH, 1, 'What toilet smoke detection systems are on the aircraft?', null, DISCUSSION),
  item('Aircraft Systems', BOTH, 1, 'What toilet fire suppression systems are on the aircraft?', null, DISCUSSION),
  item('Aircraft Systems', BOTH, 1, 'What baggage compartment smoke detection and fire suppression systems are on the aircraft?', null, DISCUSSION),

  // Passenger Handling & Regulations
  item('Passenger Handling & Regulations', BOTH, 1, 'Competent with special needs passengers - regulations & briefs', 'Unaccompanied Minors, Wheelchair/DPL Passengers, Infants, Guide dogs, Persons in Custody, Limitations for pregnant passengers, Nervous Passengers, Visually Impaired/Hearing Impaired, Passenger using Medicinal Oxygen', DISCUSSION),
  item('Passenger Handling & Regulations', BOTH, 1, 'Competent with the following regulations & requirements', 'Refuelling with Passengers on board, Exit Row Seating Requirements, Sterile/No contact period, Cabin Securing on Short Sectors, Cabin Lighting requirements (Take-off, Landing, Cruise)', DISCUSSION),

  // Communication & Emergency Equipment
  item('Communication & Emergency Equipment', BOTH, 1, 'Competent with all communication', 'Usage of Interphone, Call Light Indicator, Different Chimes, Normal/Emergency Call, Severe Turbulence', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Emergency Lights', 'Components/Duration/Activation', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'ELT', 'Location/Duration/Activation', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'PBE', 'Location (aircraft differences), Pre-flight Checks, Operation, Duration, Precautions', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Life Jackets', 'Location, Pre-flight Checks, Features, Inflation Rules, When are they required, Exits to be used, Infant Life Jackets', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Survival Kit', 'Type/Location/Contents', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Emergency First Aid Kit', 'Pre-flight Check/Contents, What to do if you open one, SAMPLE', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'BCF Fire Extinguisher', 'Location (aircraft differences), Pre-flight Checks, Duration, Operation, Precautions, Considerations with the passengers', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Fire Fighting Drills', 'Primary/Communicator/Assist, Galley Fire, Toilet Fire, Passenger Clothing Fire, PED Fire, Waste Bin Fire, Baggage Hold Fire, Post Fire Procedures', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Dangerous Goods Spill Kit', 'Location/Contents/Drill, Where to stow a DG Spill, DG Manual', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Restraints', 'Location/Contents, When/how would we use them', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Crash Axe', 'Location/what is it used for', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Infant/Extension Seatbelts', 'Location/Aircraft Differences, Pre-flight Checks', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Quick Don & Smoke Goggles', 'Location/Aircraft Differences', DISCUSSION),
  item('Communication & Emergency Equipment', BOTH, 1, 'Oxygen Bottles', 'Location/Aircraft Differences, Pre-flight Checks/PSIs, Different types of Masks, Administration/Post Use, Precautions', DISCUSSION),

  // Emergency Procedures & Survival
  item('Emergency Procedures & Survival', BOTH, 1, 'Depressurisation', 'Gradual/Rapid, Drill/Follow Up Drill including PAs, Cracked cabin window procedure', DISCUSSION),
  item('Emergency Procedures & Survival', BOTH, 1, 'Unlawful Interference', 'Bomb Threat, Hijacking, Unruly, disruptive and violent pax', DISCUSSION),
  item('Emergency Procedures & Survival', BOTH, 1, 'Emergencies/Evacuations', 'PIEMAN, Prepared & Unprepared, 10 Point Cabin Prep, Evacuation Likely/Unlikely, Evacuation Drill, Commands, Emergency Exits, Ditching', DISCUSSION),
  item('Emergency Procedures & Survival', BOTH, 1, 'Survival', 'Four Priorities of Survival, HELP Position/Group Huddle', DISCUSSION),

  // Aviation Medicine & First Aid
  item('Aviation Medicine & First Aid', BOTH, 1, 'Signs & symptoms of medical conditions and correct management', 'Dehydration, Heat Exhaustion, Hypothermia, Hypoxia/Oxygen Paradox, Chest pain, Epileptic Fit, Stroke, Nose Bleed, Hyperventilation, Allergic Reaction, Asthma Attack', DISCUSSION),
];

module.exports = items;
