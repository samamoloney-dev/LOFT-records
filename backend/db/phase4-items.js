// Phase 4 - Check to Line Preparation assessment content, transcribed from
// the "Phase 4 ASSESSMENT" tables in each pilot fleet's Line Training
// Record (SA_503 Dash 8, SA_511 Metro 23, SA_811 F100). All three fleets
// share the same overall structure (Preflight, Performance Calculations,
// Weight and Balance, Procedures, Route Knowledge, General Aircraft
// Handling, Aircraft System Knowledge, Emergency Procedures, two Instrument
// Approach blocks, Maintenance Procedures, Post Flight Duties), scored
// satisfactory / unsatisfactory / not assessed with remarks, but the exact
// item wording and a few extra items differ per fleet - each fleet has its
// own item list below rather than a shared template.

const NTS_MARKERS = [
  'Communication and Teamwork',
  'Situational Awareness',
  'Leadership and Workload Management',
  'Decision Making Process',
];

const DASH_8 = [
  { category: 'Preflight', description: 'Pre-flight/Daily Inspection (As per AMM)' },
  { category: 'Preflight', description: 'Cockpit setup' },
  { category: 'Preflight', description: 'Flight Planning', notes: 'Not required for First Officer' },
  { category: 'Preflight', description: 'Crew Coordination/Briefing' },
  { category: 'Preflight', description: 'Passenger supervision/public relations' },

  { category: 'Performance Calculations', description: 'Take off limits' },
  { category: 'Performance Calculations', description: 'Landing Limits' },
  { category: 'Performance Calculations', description: 'Emergency re-calculations', notes: 'e.g. Flapless landing, antiskid failure, etc.' },

  { category: 'Weight and Balance', description: 'Complete & Accurate' },

  { category: 'Procedures', description: 'Scans' },
  { category: 'Procedures', description: 'Checklist Use' },
  { category: 'Procedures', description: 'Standard Operating Procedures' },
  { category: 'Procedures', description: 'Radio Communication' },
  { category: 'Procedures', description: 'Knowledge of Company Manuals' },
  { category: 'Procedures', description: 'Clear and concise briefings' },

  { category: 'Route Knowledge', description: 'Appropriate use of GNSS and enroute Navigation aids' },
  { category: 'Route Knowledge', description: 'Knowledge of communication and air traffic services provided' },

  { category: 'General Aircraft Handling', description: 'Flying accurate and smooth, in line with SOPs and Jeppesen' },
  { category: 'General Aircraft Handling', description: 'Aircraft systems used correctly' },

  { category: 'Aircraft System Knowledge', description: 'System: GNSS operation' },

  { category: 'Emergency Procedures', description: 'Emergency procedure 1 assessed', notes: 'Note which emergency in Remarks' },
  { category: 'Emergency Procedures', description: 'Emergency procedure 2 assessed', notes: 'Note which emergency in Remarks' },
  { category: 'Emergency Procedures', description: 'Emergency procedure 3 assessed', notes: 'Note which emergency in Remarks' },

  { category: 'Instrument Approach 1', description: 'Tracking' },
  { category: 'Instrument Approach 1', description: 'Instrument flying smooth and accurate' },
  { category: 'Instrument Approach 1', description: 'Configuration' },
  { category: 'Instrument Approach 1', description: 'Speed control' },
  { category: 'Instrument Approach 1', description: 'Vertical profile' },
  { category: 'Instrument Approach 1', description: 'Crew Coordination and Standard Calls' },

  { category: 'Instrument Approach 2', description: 'Tracking' },
  { category: 'Instrument Approach 2', description: 'Instrument flying smooth and accurate' },
  { category: 'Instrument Approach 2', description: 'Configuration' },
  { category: 'Instrument Approach 2', description: 'Speed control' },
  { category: 'Instrument Approach 2', description: 'Vertical profile' },
  { category: 'Instrument Approach 2', description: 'Crew Coordination and Standard Calls' },

  { category: 'Maintenance Procedures', description: 'Defect recording - knowledge of procedure' },
  { category: 'Maintenance Procedures', description: 'Knowledge of MEL Application' },

  { category: 'Post Flight Duties', description: 'Actioned with due care' },
  { category: 'Post Flight Duties', description: 'Coordination with Terminal staff and Engineering' },
];

const METRO_23 = [
  { category: 'Preflight', description: 'Pre-flight/Daily Inspection (As per 2B3)' },
  { category: 'Preflight', description: 'Cockpit setup' },
  { category: 'Preflight', description: 'Flight Planning', notes: 'Not required for First Officer' },
  { category: 'Preflight', description: 'Crew Coordination/Briefing' },
  { category: 'Preflight', description: 'Passenger supervision/public relations' },

  { category: 'Performance Calculations', description: 'Take off limits' },
  { category: 'Performance Calculations', description: 'Landing Limits' },
  { category: 'Performance Calculations', description: 'Emergency re-calculations', notes: 'e.g. Flapless landing, antiskid failure, etc.' },

  { category: 'Weight and Balance', description: 'Complete & Accurate' },

  { category: 'Procedures', description: 'Scans' },
  { category: 'Procedures', description: 'Checklist Use' },
  { category: 'Procedures', description: 'Standard Operating Procedures' },
  { category: 'Procedures', description: 'Radio Communication' },
  { category: 'Procedures', description: 'Knowledge of Company Manuals' },
  { category: 'Procedures', description: 'Clear and concise briefings' },

  { category: 'Route Knowledge', description: 'Appropriate use of GNSS and enroute Navigation aids' },
  { category: 'Route Knowledge', description: 'Knowledge of communication and air traffic services provided' },

  { category: 'General Aircraft Handling', description: 'Flying accurate and smooth, in line with SOPs and Jeppesen' },
  { category: 'General Aircraft Handling', description: 'Aircraft systems used correctly' },

  { category: 'Aircraft System Knowledge', description: 'System: GNSS operation' },

  { category: 'Emergency Procedures', description: 'Emergency procedure 1 assessed', notes: 'Note which emergency in Remarks' },
  { category: 'Emergency Procedures', description: 'Emergency procedure 2 assessed', notes: 'Note which emergency in Remarks' },
  { category: 'Emergency Procedures', description: 'Emergency procedure 3 assessed', notes: 'Note which emergency in Remarks' },

  { category: 'Instrument Approach 1', description: 'Tracking' },
  { category: 'Instrument Approach 1', description: 'Instrument flying smooth and accurate' },
  { category: 'Instrument Approach 1', description: 'Configuration' },
  { category: 'Instrument Approach 1', description: 'Speed control' },
  { category: 'Instrument Approach 1', description: 'Vertical profile' },
  { category: 'Instrument Approach 1', description: 'Crew Coordination and Standard Calls' },

  { category: 'Instrument Approach 2', description: 'Tracking' },
  { category: 'Instrument Approach 2', description: 'Instrument flying smooth and accurate' },
  { category: 'Instrument Approach 2', description: 'Configuration' },
  { category: 'Instrument Approach 2', description: 'Speed control' },
  { category: 'Instrument Approach 2', description: 'Vertical profile' },
  { category: 'Instrument Approach 2', description: 'Crew Coordination and Standard Calls' },

  { category: 'Maintenance Procedures', description: 'Defect recording - knowledge of procedure' },
  { category: 'Maintenance Procedures', description: 'Knowledge of MEL Application' },

  { category: 'Post Flight Duties', description: 'Actioned with due care' },
  { category: 'Post Flight Duties', description: 'Coordination with Terminal staff and Engineering' },
];

const FOKKER_100 = [
  { category: 'Preflight', description: 'Pre-flight/Daily Inspection (As per AMM)' },
  { category: 'Preflight', description: 'Cockpit setup' },
  { category: 'Preflight', description: 'Flight Planning' },
  { category: 'Preflight', description: 'Crew Coordination / Briefing' },
  { category: 'Preflight', description: 'Passenger supervision / public relations' },
  { category: 'Preflight', description: 'License and Medical checked' },
  { category: 'Preflight', description: 'Flight and Duty times checked' },
  { category: 'Preflight', description: 'Correct company documentation procedures applied' },
  { category: 'Preflight', description: 'Obtained and understood correct operational information' },
  { category: 'Preflight', description: 'Publications amended and complete' },
  { category: 'Preflight', description: 'Duties of a pilot' },
  { category: 'Preflight', description: 'Aircraft fully serviceable for flight' },
  { category: 'Preflight', description: 'Flight instruments and navigation aids checked before take-off' },

  { category: 'Performance Calculations', description: 'Take off limits' },
  { category: 'Performance Calculations', description: 'Landing Limits' },
  { category: 'Performance Calculations', description: 'Emergency re-calculations', notes: 'e.g. Flapless landing, antiskid failure, etc.' },

  { category: 'Weight and Balance', description: 'Complete & Accurate' },

  { category: 'Procedures', description: 'Scans' },
  { category: 'Procedures', description: 'Checklist Use' },
  { category: 'Procedures', description: 'Standard Operating Procedures' },
  { category: 'Procedures', description: 'Radio Communication' },
  { category: 'Procedures', description: 'Knowledge of Company Manuals' },
  { category: 'Procedures', description: 'Clear and concise briefings' },
  { category: 'Procedures', description: 'Correctly identified navigation aids' },
  { category: 'Procedures', description: 'Accepted Navigation procedures used' },
  { category: 'Procedures', description: 'Flight tolerance as per MOS part 61 schedule 8' },
  { category: 'Procedures', description: 'Turbulence penetration', notes: 'Demonstrated or described' },

  { category: 'Route Knowledge', description: 'Appropriate use of FMS / GNSS and enroute Navigation aids' },
  { category: 'Route Knowledge', description: 'Knowledge of communication and air traffic services provided' },

  { category: 'General Aircraft Handling', description: 'Flying accurate and smooth, in line with SOPs and Jeppesen' },
  { category: 'General Aircraft Handling', description: 'Aircraft systems used correctly' },

  { category: 'Aircraft System Knowledge', description: 'System: FMS / GNSS operation', notes: 'Refer Appendix 1' },

  { category: 'Emergency Procedures', description: 'Emergency procedure 1 assessed', notes: 'Note which emergency in Remarks' },
  { category: 'Emergency Procedures', description: 'Emergency procedure 2 assessed', notes: 'Note which emergency in Remarks' },
  { category: 'Emergency Procedures', description: 'Emergency procedure 3 assessed', notes: 'Note which emergency in Remarks' },

  { category: 'Instrument Approach 1', description: 'Tracking' },
  { category: 'Instrument Approach 1', description: 'Instrument flying smooth and accurate' },
  { category: 'Instrument Approach 1', description: 'Configuration' },
  { category: 'Instrument Approach 1', description: 'Speed control' },
  { category: 'Instrument Approach 1', description: 'Vertical profile' },
  { category: 'Instrument Approach 1', description: 'Crew Coordination and Standard Calls' },

  { category: 'Instrument Approach 2', description: 'Tracking' },
  { category: 'Instrument Approach 2', description: 'Instrument flying smooth and accurate' },
  { category: 'Instrument Approach 2', description: 'Configuration' },
  { category: 'Instrument Approach 2', description: 'Speed control' },
  { category: 'Instrument Approach 2', description: 'Vertical profile' },
  { category: 'Instrument Approach 2', description: 'Crew Coordination and Standard Calls' },

  { category: 'Maintenance Procedures', description: 'Defect recording - knowledge of procedure' },
  { category: 'Maintenance Procedures', description: 'Knowledge of MEL Application' },

  { category: 'Post Flight Duties', description: 'Actioned with due care' },
  { category: 'Post Flight Duties', description: 'Coordination with Terminal staff and Engineering' },
];

const ITEMS_BY_FLEET = {
  DASH_8,
  METRO_23,
  FOKKER_100,
};

function itemsForFleet(fleet) {
  return ITEMS_BY_FLEET[fleet] || [];
}

module.exports = { NTS_MARKERS, ITEMS_BY_FLEET, itemsForFleet };
