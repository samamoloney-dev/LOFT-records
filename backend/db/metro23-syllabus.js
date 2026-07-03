// Full Metro 23 Line Training Record syllabus, transcribed from
// SA_511_Metro_23_Line_Training_Record. All items are fleet: METRO_23.
// See syllabus-helpers.js for the shared conventions.

const { SYLLABUS, DISCUSSION, BOTH, CAPTAIN_ONLY, FO_ONLY, item, splitItem } = require('./syllabus-helpers');

const items = [
  // Flight Planning
  item('Flight Planning', BOTH, 1, 'Crew Room Library'),
  item('Flight Planning', BOTH, 1, 'Personalised Tray'),
  item('Flight Planning', BOTH, 1, 'AvSys', 'Sign-ON, Memos, SITAMS, Roster, Manifest'),
  item('Flight Planning', BOTH, 1, 'AvBase'),
  item('Flight Planning', BOTH, 1, 'Sharefile'),
  ...splitItem('Flight Planning', 'AvSafe Reporting', 1, 3, '1 Capt. / 3 FO'),
  ...splitItem('Flight Planning', 'NAIPS – ARFOR/Charts', 1, 3),
  ...splitItem('Flight Planning', 'Weather Forecast Requirements', 1, 3),
  ...splitItem('Flight Planning', 'Alternate Requirements', 1, 3),
  ...splitItem('Flight Planning', 'Champagne Flight Planner', 1, 3),
  ...splitItem('Flight Planning', 'Fuel Requirements', 1, 3),
  ...splitItem('Flight Planning', 'Payload Allowance', 1, 3),
  ...splitItem('Flight Planning', 'Payload Restriction Notification', 1, 3),
  ...splitItem('Flight Planning', 'Airstrip Reports', 1, 3),
  ...splitItem('Flight Planning', 'Clegg Hammer Readings', 1, 3, '1 Capt. / 3 FO'),

  // Aircraft Documentation
  item('Aircraft Documentation', BOTH, 1, 'AFM/OM Location and Overview'),
  item('Aircraft Documentation', BOTH, 1, 'AFM Supplements'),
  item('Aircraft Documentation', BOTH, 1, 'QRH Location and Overview'),
  item('Aircraft Documentation', BOTH, 1, "QRH Phase 1's"),
  item('Aircraft Documentation', BOTH, 1, 'Aerodrome Data Cards'),
  item('Aircraft Documentation', BOTH, 1, 'Company Manuals', 'Vol 1A, 1F, 2A, 2B3 etc.'),
  item('Aircraft Documentation', BOTH, 1, 'Other Equipment Manuals', 'GNSS etc.'),

  // Flight and Maintenance Log
  ...splitItem('Flight and Maintenance Log', 'Flight Log', 1, 2),
  ...splitItem('Flight and Maintenance Log', 'Certificate of Release to Service', 1, 2),
  ...splitItem('Flight and Maintenance Log', 'Maintenance Log', 1, 2),
  ...splitItem('Flight and Maintenance Log', 'Deferred Defect Log (& recording of MEL/CDL)', 1, 2),
  ...splitItem('Flight and Maintenance Log', 'Pilot Authorised Maintenance', 1, 2),

  // RTOW/RLW & TOLD Cards
  ...splitItem('RTOW/RLW & TOLD Cards', 'RTOW Chart Types & Contents', 1, 2),
  ...splitItem('RTOW/RLW & TOLD Cards', 'RLW Chart Types & Contents', 1, 2),
  ...splitItem('RTOW/RLW & TOLD Cards', 'RTOW/RLW Data Extraction/Use', 1, 2),
  ...splitItem('RTOW/RLW & TOLD Cards', 'TOLD Card Data', 1, 2),

  // Pre-Departure
  item('Pre-Departure', BOTH, 1, 'Daily/Pre-Flight Inspection'),
  item('Pre-Departure', BOTH, 1, 'GPU Use'),
  item('Pre-Departure', BOTH, 1, 'Cockpit Setup'),
  ...splitItem('Pre-Departure', 'Fuel Reconciliation', 1, 3, '1 Capt. / 3 FO'),
  item('Pre-Departure', BOTH, 1, 'Recording ATC Clearance'),
  item('Pre-Departure', BOTH, 1, 'GPS Route and SID Insertion'),
  item('Pre-Departure', BOTH, 1, 'Crew Brief (include. T&E Mgmt.)'),
  item('Pre-Departure', CAPTAIN_ONLY, 1, 'Instrument Brief', 'Capt. Only'),
  item('Pre-Departure', BOTH, 1, 'Normal Take-off Briefing', 'Including SID'),
  item('Pre-Departure', BOTH, 1, 'Emergency Take-off Briefing'),
  ...splitItem('Pre-Departure', 'Load sheets – Cargo hold and W&B', 1, 3, '1 Capt. / 3 FO'),
  item('Pre-Departure', BOTH, 1, 'COBT compliance -/+'),
  item('Pre-Departure', BOTH, 1, 'Flight Crew Oxygen Mask'),

  // Start and Taxi
  item('Start and Taxi', BOTH, 1, 'Pre-Start and Start Procedures Flow Scans'),
  item('Start and Taxi', BOTH, 2, 'Standard Calls'),
  item('Start and Taxi', BOTH, 3, 'On Ground Emergency Scenario', 'Include Evac Proc with PAs'),

  // Take-off and Climb
  item('Take-off and Climb', BOTH, 1, 'Standard Calls – PF'),
  item('Take-off and Climb', BOTH, 1, 'Procedural Flow Scans - PF'),
  item('Take-off and Climb', BOTH, 1, 'Rejected Take-off Procedure'),
  item('Take-off and Climb', BOTH, 1, 'Climb Power Setting'),
  item('Take-off and Climb', BOTH, 1, 'Climb Profile'),
  item('Take-off and Climb', BOTH, 2, 'Standard Calls – PNF'),
  item('Take-off and Climb', BOTH, 2, 'Procedural Flow Scans - PNF'),
  item('Take-off and Climb', BOTH, 3, 'Take-off Minima'),
  item('Take-off and Climb', BOTH, 3, 'Engine Failure Procedure (Discuss)'),

  // Cruise
  item('Cruise', BOTH, 1, 'Standard Calls - PF'),
  item('Cruise', BOTH, 1, 'Turbulence Penetration'),
  item('Cruise', BOTH, 1, 'Cruise Power Setting'),
  item('Cruise', BOTH, 2, 'Standard Calls – PNF'),
  item('Cruise', BOTH, 2, 'GPS Confidence check', 'Waypoint/Confidence Check'),
  item('Cruise', BOTH, 2, 'Fuel Monitoring'),
  item('Cruise', BOTH, 2, 'Flight Log (Trend, etc.)', 'Discuss Trend Parameters'),
  item('Cruise', BOTH, 2, 'Nav Log (recording and amendments)'),
  item('Cruise', BOTH, 2, 'GPS STAR Insertion/Leg Check'),
  item('Cruise', BOTH, 3, 'In-Flight Diversions Calc.'),
  item('Cruise', BOTH, 3, 'PNR Calc.'),
  item('Cruise', BOTH, 3, 'CP Calc.'),
  item('Cruise', BOTH, 3, 'LRC Performance'),
  item('Cruise', BOTH, 3, 'OEI & Driftdown Considerations'),
  item('Cruise', BOTH, 3, 'Depressurised Flight Considerations'),

  // Descent
  item('Descent', BOTH, 1, 'Standard Calls - PF'),
  item('Descent', BOTH, 1, 'Procedural Flow Scans - PF'),
  item('Descent', BOTH, 1, 'Descent Brief', 'Including STAR & or ADC'),
  item('Descent', BOTH, 1, 'Descent Profile 3° and/or 3x'),
  item('Descent', BOTH, 2, 'Standard Calls - PNF'),
  item('Descent', BOTH, 2, 'Procedural Flow Scans - PNF'),
  item('Descent', BOTH, 3, 'Alternate Descent Profile 2x'),
  item('Descent', BOTH, 3, 'Publish Speed Restriction Compliance', 'Refer Jeppesen'),

  // Approach
  item('Approach', BOTH, 3, 'Approach Brief', 'Approach work should be at an IPC Standard in order for the Applicant to be assessed competent'),
  item('Approach', BOTH, 3, 'Approach Profile Planning'),
  item('Approach', BOTH, 1, 'Visual App - PF', 'Discuss Day & Night Criteria'),
  item('Approach', BOTH, 2, 'Visual App - PNF'),
  item('Approach', BOTH, 3, '2D - PF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, '2D - PNF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, '3D - PF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, '3D - PNF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'Azimuth - PF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'Azimuth - PNF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'CDI - PF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'CDI - PNF', 'Standard Calls & Procedural Flow Scans'),
  item('Approach', BOTH, 3, 'Missed Approach (Discuss)'),
  item('Approach', BOTH, 3, 'OEI Configurations (Discuss)'),

  // Landing
  item('Landing', BOTH, 1, 'Standard Calls - PF'),
  item('Landing', BOTH, 1, 'Stabilised Approach Criteria'),
  item('Landing', BOTH, 1, 'Touchdown Zone'),
  item('Landing', BOTH, 1, 'Full Flap Landing'),
  item('Landing', BOTH, 2, 'Standard Calls - PNF'),
  item('Landing', BOTH, 2, 'Procedural Flow Scans - PNF'),
  item('Landing', BOTH, 3, 'EGPWS Procedure/standard Calls'),
  item('Landing', BOTH, 3, 'Windshear Procedure/standard Calls'),
  item('Landing', BOTH, 3, 'Crosswind Technique/Limitations'),
  item('Landing', BOTH, 3, 'Half Flap Landing (Alternative)', 'Discuss only or Sim'),

  // Destination Procedure
  ...splitItem('Destination Procedure', 'Parking', 1, 3, '1 Capt. / 3 FO'),
  item('Destination Procedure', BOTH, 1, 'GPU Use'),
  item('Destination Procedure', BOTH, 1, 'Shutdown'),
  item('Destination Procedure', BOTH, 2, 'Radio Contact Procedure', 'Inbound and Outbound'),
  item('Destination Procedure', BOTH, 2, 'Dangerous Goods Challenge'),
  item('Destination Procedure', BOTH, 3, 'Turn-around Duties'),

  // All Flight Phases
  item('All Flight Phases', BOTH, 3, 'Checklist use (Normal and Abnormal)'),
  item('All Flight Phases', BOTH, 3, 'R/T Concise and Correct'),
  item('All Flight Phases', BOTH, 3, "Passenger PA's"),
  item('All Flight Phases', BOTH, 3, 'Weather Radar Use', 'Include WX Radar Check'),
  item('All Flight Phases', BOTH, 3, 'CB Avoidance/Minimums'),
  item('All Flight Phases', BOTH, 3, 'Icing Considerations', 'Include De-ice Check'),
  item('All Flight Phases', FO_ONLY, 3, 'Assertiveness (F/O)'),
  item('All Flight Phases', CAPTAIN_ONLY, 3, 'Command of Flight (Capt.)'),
  item('All Flight Phases', BOTH, 3, 'Pilot Incapacitation', 'Demonstrate & or Discuss'),
  item('All Flight Phases', BOTH, 3, 'CRM Handling Over Assertive Crew'),
  item('All Flight Phases', BOTH, 3, 'CRM Handling Submissive Crew'),

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

  // System Reviews
  item('System Reviews', BOTH, 3, 'Electrical System - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Fuel System - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Master Warning & Lighting - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Power Plant - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Fire Protection/Detection - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Ice and Rain Protection - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Air Conditioning - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Pressurisation & Oxygen - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Hydraulic System - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Landing Gear/Brakes - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Flight Controls - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'Avionics - Reviewed and discussed'),
  item('System Reviews', BOTH, 3, 'GNSS Garmin GTN625: Creating and Activating Plan', 'Demonstrates competency in required functions for all phases of flight'),
  item('System Reviews', BOTH, 3, 'GNSS Garmin GTN625: Insert Procedure (SID/STAR/APPR)', 'Demonstrates competency in required functions for all phases of flight'),
  item('System Reviews', BOTH, 3, 'GNSS Garmin GTN625: Additional Features/Differences', 'Demonstrates competency in required functions for all phases of flight'),

  // Systems Questions
  item('Systems Questions', BOTH, 3, 'Systems Questions (Appendix 1) reviewed and discussed to satisfactory standard with Training Captain prior to completion of Phase 3'),

  // Line Training Discussion Items - Company SOPs
  item('Company SOPs', BOTH, 3, 'What is the procedure for swapping who has control of the aircraft during flight?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'When the PNF hands the radio over to the PF, what must the PF do with his audio panel?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What are the requirements for a sterile cockpit?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'On departure from an outport, when would you make an outbound call? And how long is a site (not company) frequency required to be monitored?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'When in CTA and cleared for descent, what should the assigned altitude indicator be set to? Once LSALT/MSA has been set, when can the indication be changed?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'Describe the 3 "guidance" stages in the resolution of cockpit issues. Describe the solution statement. Describe the emergency statement. If the emergency statement is used and a remedial response from the PF is not enacted, what must the PNF do? What additional step must be taken if the emergency statement is used?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is an accident and what is an incident? How and when should they be reported? (Discuss AvSafe Reporting)', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'You have been asked to participate in a test flight of a company aircraft to check the pressurisation controller. What specific requirements must be met prior to flight?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'Who should be advised when a major defect is discovered?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'How should pilots contact engineering when operating away from the Perth base?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'Are passenger manifests required to be left anywhere? How does the company meet this requirement?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is the standard passenger weight – Males, Females?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'When would standard passenger weights not be used?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'When is the seat belt sign required to be on?', null, DISCUSSION),
  item('Company SOPs', BOTH, 3, 'What is the procedure when faced with or advised of an intoxicated passenger prior to boarding at an outport? What is the procedure when faced with an intoxicated or unruly passenger during flight?', null, DISCUSSION),

  // Line Training Discussion Items - Fuel and Refuelling
  item('Fuel and Refuelling', BOTH, 3, 'Describe the company fuel policy, include type specific requirements.', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Describe fuel requirements for Abnormal operations (OEI/DP)', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Describe the payload allowance with regards to fuel, when would this not be required', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Describe the requirements for over-wing refuelling', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Demonstrate the use of Magna Sticks, recording and conversion', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'How is the fuel quantity checked within 3%?', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'What is the conversion factor to be used when converting Litres to Kilograms?', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Describe the procedures for aircraft fuel system testing. (Quality/Quantity/Gauge)', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Describe the procedures for refuelling from a bulk installation and from drum stock.', null, DISCUSSION),
  item('Fuel and Refuelling', BOTH, 3, 'Discuss Enroute aerodromes/EDTO/Adequate Aerodrome requirement and definition', null, DISCUSSION),

  // Line Training Discussion Items - Jeppesen and IPC Knowledge
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What must you do to become current after not flying for 35 days?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'List the currency requirements for day, night and IFR flight.', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'When should instrument approaches be practiced?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Discuss Chart Contents (SID, STAR, APPR) and Demonstrate proficiency in briefing.', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, "What speed is targeted when ATC say 'Resume Published Speed' or when not on a STAR/SID 'Resume Normal Speed'? What is the difference between an ATC Speed Restriction and an Airspace Speed Restriction?", null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'IFR Altimeter Tolerances', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What are the responsibilities of the Pilot in command with regards suitability of aerodromes?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Alternate requirements (WX/Nav Aid/Lighting)', 'See Flight Planning', DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'What are the procedures for operating into a non-navaid aerodrome at night? Discuss NVFR Requirements', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Describe Visual Approach Criteria – Day/Night', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'PBN – Discuss: Company Approval (RNP?/RNAV?) and tolerances (TERM/ENR/RNP), Equipment required, Non-compliance procedure/requirements, Alternate requirements (if any)', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'ADS-B – What is it? Equipment required. Discuss Non-compliance procedure/requirements', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Describe Flight and Duty limits', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Does your aircraft require Weather Radar to be fitted and serviceable for flight? When may a company aircraft proceed into IMC without a serviceable Weather Radar?', null, DISCUSSION),
  item('Jeppesen and IPC Knowledge', BOTH, 3, 'Which category cyclone and warnings are destinations not served by the company?', null, DISCUSSION),

  // Line Training Discussion Items - Performance
  item('Performance', BOTH, 3, 'Describe the content and demonstrate the use of the RTOW/RLW charts.', 'See RTOW/RLW', DISCUSSION),
  item('Performance', BOTH, 3, 'Can explain how to check whether a landing requires bleeds low, high or off', null, DISCUSSION),
  item('Performance', BOTH, 3, 'What is the max downwind for a take-off?', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Can explain the significance of V1, V2, Vyse, V50/V35', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Can locate and extract information for Max range cruise.', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Demonstrate the use of the SPM (Flight Planning, LRC figures (AEO and OEI))', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Can locate factors to adjust landing distance for: Landing with antiskid inoperative - 6DC and 8DC, Landing flaps up - 6DC and 8DC, Landing with one engine inoperative - 6DC and 8DC, Take off with antiskid inoperative - 6DC and 8DC', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Can complete a manual calculation of take-off distance required', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Can complete a manual calculation of landing distance required.', null, DISCUSSION),
  item('Performance', BOTH, 3, 'Describe the requirements of Part 121 Chapter 9 and associated a/c configurations.', null, DISCUSSION),

  // Line Training Discussion Items - Loading and Restraint
  item('Loading and Restraint', BOTH, 3, 'Can indicate the various cargo zones (nose, A, B) and describe their limitations', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'Pilot demonstrates the ability to load the aircraft according to the rules.', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'Pilot is aware of need to verify that the passengers actually sit in the areas required by the weight and balance form.', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'Pilot can demonstrate the use of the Combi load sheet.', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'Demonstrate the use of the SALS Loading System', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'When should cargo be refused carriage? Must freight have a consignment note or label? Is a manifest by itself suitable?', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'When is a floor spreader required for cargo?', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'What is heavy freight and when can it be carried?', null, DISCUSSION),
  item('Loading and Restraint', BOTH, 3, 'Discuss a Dangerous Goods scenario requiring the use of 1D', null, DISCUSSION),

  // Line Training Discussion Items - Abnormal and Emergency
  item('Abnormal and Emergency', BOTH, 3, 'Under what circumstances may an aircraft be landed above the MLW? What should be considered in making this decision?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'When considering the optimum landing point for a ditching, which face/point of the swell is best?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'Describe the company failure management procedure.', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What actions should be taken after experiencing a bird strike?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What actions should be undertaken after experiencing a lightning strike?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'When continuing flight after an engine failure/shutdown what considerations should be addressed when choosing between continuing to the destination, returning to the departure aerodrome or diverting to an alternate?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'When advising passengers over the PA about any abnormality in the flight how should the PA begin? What other 3 items should be covered?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What action should be undertaken if a bomb threat is received by an aircraft on the ground? – In the air?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'What survival equipment is required to be carried?', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'Describe Customer Service Levels', null, DISCUSSION),
  item('Abnormal and Emergency', BOTH, 3, 'Describe the use, situation, and how to operate, including communication of the flight crew oxygen system.', null, DISCUSSION),

  // Line Training Discussion Items - Evacuation Procedures
  item('Evacuation Procedures', BOTH, 3, 'Pilot can state what action must precede the opening of an emergency exit during an emergency evacuation.', null, DISCUSSION),
  item('Evacuation Procedures', BOTH, 3, 'Pilot can state the final call to the passengers to prepare for immanent impact.', null, DISCUSSION),
  item('Evacuation Procedures', BOTH, 3, "Describe the 'Brace' command (when, how and by whom is it given?)", null, DISCUSSION),
  item('Evacuation Procedures', BOTH, 3, 'Describe the 3 types of evacuation possible (unprepared, prepared and precautionary disembarkation)', null, DISCUSSION),
  item('Evacuation Procedures', BOTH, 3, "Describe the Captain's brief in the event of a precautionary disembarkation", null, DISCUSSION),
  item('Evacuation Procedures', BOTH, 3, 'After preparing the passengers for an emergency evacuation that is subsequently not required, what announcement should be directed to the passengers?', null, DISCUSSION),
  item('Evacuation Procedures', BOTH, 3, "How and by whom is the 'Evacuation' command given?", null, DISCUSSION),
  item('Evacuation Procedures', BOTH, 3, "Describe each crew member's role in the event of an emergency evacuation.", null, DISCUSSION),

  // Line Training Discussion Items - Fatigue Management
  item('Fatigue Management', BOTH, 3, 'Where would you find company fatigue management limitations and restrictions?', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'What is the maximum FDP can you conduct if you signed on at 0530 and are flying 3 sectors?', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'If sleeping rest is provided, how many hours can you increase your duty by?', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'If you had sleeping accommodation provided and you worked a 13hr duty, how many hours rest are you required to have?', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'Describe what the maximum duty and maximum flight hours for 7, 14, 28 and 365 days', null, DISCUSSION),
  item('Fatigue Management', BOTH, 3, 'When you sign on for a duty using AVSYS, what are you confirming?', null, DISCUSSION),
];

module.exports = items;
