// Full Dash 8 Line Training Record syllabus, transcribed from
// SA_503_Dash_8_Line_Training_Record. All items are fleet: DASH_8.
//
// roleScope follows the document's Captain/FO distinction (the applicant's
// assigned seat), not the PF/MP (Pilot Flying/Monitoring Pilot) in-flight
// role - every applicant, Captain or FO track, practices both PF and MP
// across different legs, so PF/MP-labelled items are role_scope BOTH.
// A few items genuinely differ by phase depending on the applicant's seat
// (e.g. "1CAPT | 3FO" in the document) - those are modelled as two separate
// rows, one CAPTAIN_ONLY and one FO_ONLY, each with its own phase.

const SYLLABUS = 'SYLLABUS';
const DISCUSSION = 'DISCUSSION';
const BOTH = 'BOTH';
const CAPTAIN_ONLY = 'CAPTAIN_ONLY';
const FO_ONLY = 'FO_ONLY';

function item(category, roleScope, phase, description, notes, section = SYLLABUS) {
  return { category, section, roleScope, phase, description, notes: notes || null, required: true };
}

// Items that split 1CAPT / nFO - same description, two rows.
function splitItem(category, description, captainPhase, foPhase, notes) {
  return [
    item(category, CAPTAIN_ONLY, captainPhase, description, notes),
    item(category, FO_ONLY, foPhase, description, notes),
  ];
}

const items = [
  // Flight Planning
  item('Flight Planning', BOTH, 1, 'Crew Room Library'),
  item('Flight Planning', BOTH, 1, 'Personalised Tray'),
  item('Flight Planning', BOTH, 1, 'AvSys', 'Sign-ON, Memos, SITAMS, Roster, Manifest'),
  item('Flight Planning', BOTH, 1, 'AvBase'),
  item('Flight Planning', BOTH, 1, 'Sharefile'),
  item('Flight Planning', BOTH, 1, 'iPad'),
  item('Flight Planning', BOTH, 1, 'ForeFlight'),
  ...splitItem('Flight Planning', 'AvSafe Reporting', 1, 3, '1 Capt. / 3 FO'),
  ...splitItem('Flight Planning', 'NAIPS', 1, 3, '1 Capt. / 3 FO'),
  ...splitItem('Flight Planning', 'Champagne Flight Planner', 1, 3, '1 Capt. / 3 FO'),
  ...splitItem('Flight Planning', 'Payload Fuel Allowance', 1, 3, '1 Capt. / 3 FO'),
  ...splitItem('Flight Planning', 'Payload Restriction Notification', 1, 3, '1 Capt. / 3 FO'),
  ...splitItem('Flight Planning', 'Airstrip Reports', 1, 3, '1 Capt. / 3 FO'),
  ...splitItem('Flight Planning', 'Clegg Hammer Readings', 1, 3, '1 Capt. / 3 FO'),
  ...splitItem('Flight Planning', 'Trim Sheets', 1, 3, '1 Capt. / 3 FO'),

  // Aircraft Documentation
  item('Aircraft Documentation', BOTH, 1, 'AFM'),
  item('Aircraft Documentation', BOTH, 1, 'AFM Supplements'),
  item('Aircraft Documentation', BOTH, 1, 'QRH'),
  item('Aircraft Documentation', BOTH, 1, 'ODM'),
  item('Aircraft Documentation', BOTH, 1, 'Aerodrome Data Cards'),
  item('Aircraft Documentation', BOTH, 1, 'Company Manuals', '2B2/3A/2D/1D/1F/1A'),
  item('Aircraft Documentation', BOTH, 1, 'Other Equipment Manuals', 'GNSS etc.'),

  // Flight and Maintenance Log
  ...splitItem('Flight and Maintenance Log', 'Flight Log', 1, 3),
  ...splitItem('Flight and Maintenance Log', 'Certificate of Release to Service', 1, 3),
  ...splitItem('Flight and Maintenance Log', 'Maintenance Log', 1, 3),
  ...splitItem('Flight and Maintenance Log', 'Deferred Defect Log (& recording of MEL/CDL)', 1, 3),
  ...splitItem('Flight and Maintenance Log', 'Pilot Authorised Maintenance', 1, 3),

  // RTOW/RLW & TOLD Cards
  ...splitItem('RTOW/RLW & TOLD Cards', 'RTOW Chart Types & Contents', 1, 2),
  ...splitItem('RTOW/RLW & TOLD Cards', 'RLW Chart Types & Contents', 1, 2),
  ...splitItem('RTOW/RLW & TOLD Cards', 'RTOW/RLW Data Extraction/Use', 1, 2),
  ...splitItem('RTOW/RLW & TOLD Cards', 'TOLD Card', 1, 2),

  // Fuel Policy
  item('Fuel Policy', BOTH, 2, 'Taxi Fuel'),
  item('Fuel Policy', BOTH, 2, 'Destination Fuel'),
  item('Fuel Policy', BOTH, 2, 'Contingency Fuel'),
  item('Fuel Policy', BOTH, 2, 'Alternate'),
  item('Fuel Policy', BOTH, 2, 'Final Reserve'),
  item('Fuel Policy', BOTH, 2, 'Additional'),
  item('Fuel Policy', BOTH, 2, 'Holding'),
  item('Fuel Policy', BOTH, 2, 'Single Engine Operation'),
  item('Fuel Policy', BOTH, 2, 'Depressurised Flight'),
  item('Fuel Policy', BOTH, 2, 'Route Distance Limitations'),
  item('Fuel Policy', BOTH, 2, 'Approach Allowance'),
  item('Fuel Policy', BOTH, 2, 'APU Allowance'),

  // Pre-Departure
  item('Pre-Departure', BOTH, 1, 'Daily/Pre-Flight Inspection'),
  item('Pre-Departure', CAPTAIN_ONLY, 1, 'Cockpit Setup', 'Captain only'),
  item('Pre-Departure', BOTH, 1, 'Flight Crew Oxygen Mask'),
  item('Pre-Departure', BOTH, 1, 'GPU/APU Usage'),
  item('Pre-Departure', BOTH, 1, 'Fuel Reconciliation'),
  item('Pre-Departure', BOTH, 1, 'Checklist Use'),
  item('Pre-Departure', FO_ONLY, 1, 'FO Pre-Start Procedures', 'FO only'),
  item('Pre-Departure', BOTH, 1, 'APU Start'),
  item('Pre-Departure', CAPTAIN_ONLY, 1, 'GPU Start', 'Captain only'),
  item('Pre-Departure', CAPTAIN_ONLY, 2, 'Battery Start', 'Captain only'),
  item('Pre-Departure', BOTH, 3, 'Single Engine Turn Around'),
  item('Pre-Departure', BOTH, 1, 'COBT / TOBT Compliance'),
  item('Pre-Departure', BOTH, 2, 'TEM Crew Briefing'),
  item('Pre-Departure', BOTH, 2, 'GPS Route and SID Insertion'),
  item('Pre-Departure', BOTH, 2, 'Normal Take-off Briefing'),
  item('Pre-Departure', CAPTAIN_ONLY, 2, 'Emergency Take-off Briefing', 'Captain only'),

  // Take-off and Climb
  item('Take-off and Climb', BOTH, 1, 'Standard Calls – PF'),
  item('Take-off and Climb', BOTH, 1, 'Rejected Take-off Procedure'),
  item('Take-off and Climb', BOTH, 1, 'Climb Power Setting'),
  item('Take-off and Climb', BOTH, 1, 'Climb Profile'),
  item('Take-off and Climb', BOTH, 2, 'Standard Calls – MP'),
  item('Take-off and Climb', BOTH, 2, 'Take-off Minima'),
  item('Take-off and Climb', BOTH, 3, 'On Ground Emergency'),
  item('Take-off and Climb', BOTH, 3, 'Evacuation Procedure'),
  item('Take-off and Climb', BOTH, 3, 'Engine Failure Procedure'),
  item('Take-off and Climb', BOTH, 3, 'Narrow Runway Operations'),

  // Cruise
  item('Cruise', BOTH, 1, 'Cruise Power Setting'),
  item('Cruise', BOTH, 1, 'Flight Log'),
  item('Cruise', BOTH, 1, 'Aircraft Trend Monitoring'),
  item('Cruise', BOTH, 2, 'Turbulence Penetration'),
  item('Cruise', BOTH, 2, 'CB Avoidance/Minimums'),
  item('Cruise', BOTH, 2, 'Icing Considerations', 'Inc. Ice Protection Checks'),
  item('Cruise', BOTH, 3, 'Enroute Alternates'),
  item('Cruise', BOTH, 3, 'In-Flight Diversions Calc.'),
  item('Cruise', BOTH, 3, 'PNR Calc.'),
  item('Cruise', BOTH, 3, 'CP Calc.'),
  item('Cruise', BOTH, 3, 'OEI/Driftdown Considerations'),
  item('Cruise', BOTH, 3, 'Depressurised Flight Considerations'),
  item('Cruise', BOTH, 3, 'LRC Performance'),

  // Descent
  item('Descent', BOTH, 1, 'Descent Brief'),
  item('Descent', BOTH, 1, 'Descent Profile 3x'),
  item('Descent', BOTH, 3, 'Descent Profile 2x'),

  // Approach
  item('Approach', BOTH, 3, 'Approach Brief', 'Approach work should be at an IPC Standard in order for the Applicant to be assessed competent'),
  item('Approach', BOTH, 3, 'Approach Profile Planning'),
  item('Approach', BOTH, 2, 'Deviation Calls - Standard Flight Deck Responses'),
  item('Approach', BOTH, 1, 'Visual App - PF', 'Discuss Day & Night Criteria'),
  item('Approach', BOTH, 2, 'Visual App - MP'),
  item('Approach', BOTH, 3, '2D - PF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, '2D - MP', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, '3D - PF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, '3D - MP', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'Azimuth - PF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'Azimuth - MP', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'CDI - PF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'CDI - MP', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'Missed Approach (Discuss)'),
  item('Approach', BOTH, 3, 'OEI Configurations (Discuss)'),

  // Landing, Taxi and Shutdown
  item('Landing, Taxi and Shutdown', BOTH, 1, 'Standard Calls - PF'),
  item('Landing, Taxi and Shutdown', CAPTAIN_ONLY, 1, 'Procedural Flow Scans - Captain'),
  item('Landing, Taxi and Shutdown', FO_ONLY, 1, 'Procedural Flow Scans - FO'),
  item('Landing, Taxi and Shutdown', BOTH, 1, 'Touchdown Zone'),
  item('Landing, Taxi and Shutdown', BOTH, 1, 'Crosswind Technique/Limitations'),
  item('Landing, Taxi and Shutdown', BOTH, 1, 'Flap 15° Landing'),
  item('Landing, Taxi and Shutdown', BOTH, 1, 'APU Usage'),
  item('Landing, Taxi and Shutdown', BOTH, 2, 'Standard Calls - MP'),
  item('Landing, Taxi and Shutdown', CAPTAIN_ONLY, 2, 'Parking', 'Capt. Only'),
  item('Landing, Taxi and Shutdown', BOTH, 3, 'EGPWS Procedure/standard Calls'),
  item('Landing, Taxi and Shutdown', BOTH, 3, 'Windshear Procedure/standard Calls'),
  item('Landing, Taxi and Shutdown', BOTH, 3, 'Flap 35° Landing'),
  item('Landing, Taxi and Shutdown', BOTH, 3, 'Stabilised Approach Criteria'),
  item('Landing, Taxi and Shutdown', BOTH, 3, 'Supp 88 Landing'),

  // Destination Procedure
  item('Destination Procedure', BOTH, 1, 'Radio Contact'),
  item('Destination Procedure', CAPTAIN_ONLY, 1, 'Captain Duties'),
  item('Destination Procedure', FO_ONLY, 1, 'FO Duties'),
  item('Destination Procedure', BOTH, 2, 'Dangerous Goods Challenge'),

  // Minimum Equipment List
  item('Minimum Equipment List', BOTH, 3, 'MEL Purpose'),
  item('Minimum Equipment List', BOTH, 3, 'MEL Layout / Design'),
  item('Minimum Equipment List', BOTH, 3, 'MEL Application'),
  item('Minimum Equipment List', BOTH, 3, 'Completed practice MEL paperwork P26/27'),

  // System Reviews
  item('System Reviews', BOTH, 1, 'Electrical System - Reviewed and discussed'),
  item('System Reviews', BOTH, 1, 'Fuel System - Reviewed and discussed'),
  item('System Reviews', BOTH, 1, 'APU - Reviewed and discussed'),
  item('System Reviews', BOTH, 1, 'Fire Protection/Detection - Reviewed and discussed'),
  item('System Reviews', BOTH, 2, 'Power Plant - Reviewed and discussed'),
  item('System Reviews', BOTH, 2, 'Ice and Rain Protection - Reviewed and discussed'),
  item('System Reviews', BOTH, 2, 'Air Conditioning - Reviewed and discussed'),
  item('System Reviews', BOTH, 2, 'Pressurisation & Oxygen - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Hydraulic System - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Landing Gear/Brakes - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Flight Controls - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Avionics - Reviewed and discussed'),
  item('System Reviews', BOTH, 2, 'UNS-FMC: Creating and Activating Plan'),
  item('System Reviews', BOTH, 2, 'UNS-FMC: Insert SID'),
  item('System Reviews', BOTH, 2, 'UNS-FMC: Insert STAR'),
  item('System Reviews', BOTH, 2, 'UNS-FMC: Confidence Check'),
  item('System Reviews', BOTH, 2, 'UNS-FMC: RAIM Check'),
  item('System Reviews', BOTH, 2, 'UNS-FMC: Nearest Aerodrome'),

  // Systems Questions
  item('Systems Questions', BOTH, 3, 'DHC8 Systems Questions (Appendix 1) reviewed and discussed to satisfactory standard with Training Captain prior to completion of Phase 3'),

  // Line Training Discussion Items - Company SOPs
  item('Company SOPs', BOTH, 3, 'When are two pilots required to be at the controls?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is the procedure for swapping who has control of the aircraft during flight?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What are the requirements for a sterile cockpit?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is the company policy on tail wind take off and landings at non-controlled aerodromes?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'Describe the 3 stages of the Support Process in the resolution of cockpit issues.', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'How do you determine the level of assertiveness to use?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'Describe the solution statement. Describe the emergency statement.', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'If the emergency statement is used and a remedial response from the PF is not enacted, what must the MP do?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What are some examples of items that are required to be reported via the AvSafe system?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What are an accident and an incident? How and when should they be reported?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'You have been asked to participate in a test flight of a company aircraft to check the pressurisation controller. What specific requirements must be met prior to flight?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'How can pilots contact engineering when operating away from the Perth base?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'Minimum age to sit in an emergency exit?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is the standard passenger weight – Males, Females?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'When would standard passenger weights not be used?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'When is the seat belt sign required to be on?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is the procedure when faced with an intoxicated passenger prior to boarding at an outport? What about in flight?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is considered heavy freight?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'Why it is critical all freight items have the contents description attached to it?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'How does the PIC ensure the Aerodrome is serviceable prior to landing?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is the absolute minimum Clegg hammer reading?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, "What is the definition of an 'Adequate Aerodrome'?", null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'How do we calculate the acceleration altitude when conducting an instrument approach?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'Are you required to have your licence and medical with you during a flight?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'You have been ill and off work for some days. After how many days of being off work due illness must you obtain a medical certificate (from a DAME) before recommencing flight duties?', null, DISCUSSION),

  // Line Training Discussion Items - Fuel and Refuelling
  item('Fuel and Refuelling', BOTH, 3, 'State types of fuel able to be used in the Dash 8', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'What is the freezing point of Jet A1?', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Describe number and position of earth lines attachments during refuelling.', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Describe method of testing fuel', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'What is the standard fuel requirement for the Dash 8?', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'What is the tolerance of Magna Stick readings?', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'How is the fuel quantity to be checked within 3%?', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Why must the fuel panel be checked after each re-fuelling?', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Which aircraft have a refuelling hot battery switch?', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Knows the rules governing the use of the APU during refuelling.', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'What are the conversion factors for lbs - L - kg?', null, DISCUSSION),

  // Line Training Discussion Items - Jeppesen and IPC Knowledge
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'List the currency requirements for day, night and IFR flight.', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What are the company night recency requirements?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What are the company aircraft type recency requirements?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What are STAAS? What is "Profile Speed" when issued by ATC?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Can you operate into a non-instrument approach aerodrome such as YPEN at night?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'IFR Altimeter Tolerances. What should it read on the Skippers apron?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Weather Forecast Requirements. The PIC must obtain an update how long prior to each departure?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'When is an alternate required?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What are the lighting requirements for alternate aerodromes?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'List the ways that a TAF 3 forecast can affect a Part 121 operating flight', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Describe SID & STAR design & features.', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, "What does the 'Maltese Cross' designate on approach charts?", null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Visual Approach Criteria - by day and night.', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What are the two different departure reports? When do you use which one?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'When must a Missed Approach be conducted off an instrument approach?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What does ADS-B stand for & how do we use it?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Describe RNP during the enroute, terminal & approach phases.', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'On approach charts, why do some waypoints have a circling around them?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What is the lowest cloud and visibility ceiling for take-off from Perth? From site? What addition considerations should the crew make? Departure Alternate', null, DISCUSSION),

  // Line Training Discussion Items - Performance
  item('Performance', BOTH, 3, 'What is the max downwind for a take-off and landing?', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Can locate and extract information for Long Range Cruise.', null, DISCUSSION),
  item('Performance', BOTH, 3, 'What factor is required to adjust landing distance for: Landing with antiskid inoperative, OEI & ECU failure?', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Under what circumstance are the landing factors listed in the Part 121 MOS not required to be complied with?', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Which aerodromes require a static take off?', null, DISCUSSION),
  item('Performance', BOTH, 3, 'If both a Flap 5 and Flap 10 take-off is available, what would be the performance difference?', null, DISCUSSION),
  item('Performance', BOTH, 3, 'What are the hazards when operating from a Narrow Runway?', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Why is the Yaw Damper required to be off for a take-off from a Narrow Runway?', null, DISCUSSION),
  item('Performance', BOTH, 3, 'What is the minimum take-off weight (actual or assumed) when operating a DHC8-100 with the Yaw Damper ON?', null, DISCUSSION),

  // Line Training Discussion Items - Loading and Restraint
  item('Loading and Restraint', BOTH, 3, 'Can indicate the various cargo zones.', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'What are the max weight capacities for each of the cargo locations and combined limit for zones A and B?', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'How do you work out floor loading restrictions?', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'Knows how to secure freight and baggage.', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'If the aircraft C of G was outside the forward limit what can be done?', null, DISCUSSION),

  // Line Training Discussion Items - Abnormal and Emergency
  item('Abnormal and Emergency', BOTH, 3, 'What is the difference between an emergency landing, a forced landing and a ditching?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'Under what circumstances may an aircraft be landed above MLW? What should be considered in making this decision?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'When considering the optimum landing point for a ditching, which face/point of the swell is best?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What actions should be taken after experiencing a bird strike?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What actions should be undertaken after experiencing a lightning strike?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'When continuing flight after an engine failure/shutdown what considerations must be addressed when choosing aerodromes other than the nearest suitable?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What is an example of a PA if you had an engine failure in flight?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What action should be undertaken if a bomb threat is received by an aircraft – on the ground? – In the air?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What survival equipment is required to be carried?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What squawk code would you use following a radio failure?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'How could you contact ATC in the event of a radio failure?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'Pilot can state the final call to the passengers to prepare for imminent impact.', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What items does the FO take during an evacuation?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What must the Captain do prior to exiting the aircraft?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What actions do you expect the Cabin Attendant to perform during an emergency evacuation?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'Describe the company failure management procedure.', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'Describe the use, situation, and how to operate, including communication of the flight crew oxygen system.', null, DISCUSSION),

  // Line Training Discussion Items - Fatigue Management
  item('Fatigue Management', BOTH, 3, 'Where would you find company fatigue management limitations and restrictions?', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'What is the maximum FDP can you conduct if you signed on at 0530 and are flying 3 sectors?', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'If sleeping rest is provided, how many hours can you increase your duty by?', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'If you had sleeping accommodation provided and you worked a 13hr duty, how many hours rest are you required to have?', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'Describe what the maximum duty and maximum flight hours for 7, 14, 28 and 365 days', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'When you sign on for a duty using AVSYS, what are you confirming?', null, DISCUSSION),
];

module.exports = items;
