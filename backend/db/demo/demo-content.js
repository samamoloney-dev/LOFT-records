// Invented content for the demonstration site (a fictional CASA Part 135
// operator flying a Cessna Citation 550 and a Beechcraft King Air B200).
// Every name, ARN and item below is made up for the demo - nothing here is
// copied from a real operator's syllabus, forms or crew.

const CITATION = 'CITATION_550';
const KING_AIR = 'KING_AIR_B200';

// Two staff logins. Both are also line pilots (their crew records are linked
// to these accounts), so the demo shows "a post holder who is also on the
// roster", which is how a small Part 135 operator really works.
const STAFF = [
  {
    key: 'hotc', name: 'Daniel Marsh', email: 'hotc@demo.example', role: 'HOTC', arn: 'DEMO-1001',
    fleets: [CITATION, KING_AIR],
    checkAccess: ['PC', 'IPC', 'LINE_CHECK', 'CHECK_TO_LINE', 'EMERGENCY_PROCEDURES'],
  },
  {
    key: 'hofo', name: 'Helen Okafor', email: 'hofo@demo.example', role: 'HOFO', arn: 'DEMO-1005',
    fleets: [CITATION, KING_AIR],
    checkAccess: ['PC', 'IPC', 'LINE_CHECK', 'CHECK_TO_LINE', 'EMERGENCY_PROCEDURES'],
  },
];

// Eight line pilots (including the two post holders above). The *Ago values
// are days before today, so the demo always has a realistic mix of current,
// due-soon and overdue items however long after seeding it is looked at:
// recurrent checks are due 365 days after the last one.
const LINE_PILOTS = [
  { first: 'Daniel', last: 'Marsh', role: 'CAPTAIN', fleet: CITATION, arn: 'DEMO-1001', staff: 'hotc', epAgo: 60, ipcAgo: 120, pcAgo: 120, lineAgo: 200 },
  { first: 'Priya', last: 'Nand', role: 'CAPTAIN', fleet: CITATION, arn: 'DEMO-1002', epAgo: 300, ipcAgo: 330, pcAgo: 330, lineAgo: 150 },
  { first: 'Tom', last: 'Eriksen', role: 'FIRST_OFFICER', fleet: CITATION, arn: 'DEMO-1003', epAgo: 90, ipcAgo: 400, pcAgo: 400, lineAgo: 250 },
  { first: 'Jess', last: 'Calloway', role: 'FIRST_OFFICER', fleet: CITATION, arn: 'DEMO-1004', epAgo: 20, ipcAgo: 30, pcAgo: 30, lineAgo: 60 },
  { first: 'Helen', last: 'Okafor', role: 'CAPTAIN', fleet: KING_AIR, arn: 'DEMO-1005', staff: 'hofo', epAgo: 45, ipcAgo: 80, pcAgo: 80, lineAgo: 110 },
  { first: 'Marcus', last: 'Bell', role: 'CAPTAIN', fleet: KING_AIR, arn: 'DEMO-1006', epAgo: 350, ipcAgo: 200, pcAgo: 200, lineAgo: 340 },
  { first: 'Sam', last: 'Whitlock', role: 'FIRST_OFFICER', fleet: KING_AIR, arn: 'DEMO-1007', epAgo: 380, ipcAgo: 100, pcAgo: 100, lineAgo: 30 },
  { first: 'Lena', last: 'Fischer', role: 'FIRST_OFFICER', fleet: KING_AIR, arn: 'DEMO-1008', epAgo: 150, ipcAgo: 150, pcAgo: 150, lineAgo: 100 },
];

// Two pilots in LOFT (Line-Oriented Flight Training). newHire also creates
// their crew profile, so with the eight above the roster has ten pilots.
const LOFT_TRAINEES = [
  { first: 'Ben', last: 'Carraway', role: 'FIRST_OFFICER', fleet: CITATION, arn: 'DEMO-1009' },
  { first: 'Mia', last: 'Tran', role: 'FIRST_OFFICER', fleet: KING_AIR, arn: 'DEMO-1010' },
];

// LOFT syllabus items per fleet: [phase, category, description, notes].
const SYLLABUS = {
  [CITATION]: [
    [1, 'Normal Operations', 'Pre-flight inspection and external checks'],
    [1, 'Normal Operations', 'Cockpit preparation and flows'],
    [1, 'Normal Operations', 'Engine start, including cold-weather considerations'],
    [1, 'Normal Operations', 'Taxi, pre-take-off checks and take-off'],
    [1, 'Normal Operations', 'Climb, cruise and descent profile management'],
    [2, 'Abnormal and Emergency Operations', 'Engine failure after V1'],
    [2, 'Abnormal and Emergency Operations', 'Engine fire on the ground and in flight'],
    [2, 'Abnormal and Emergency Operations', 'Pressurisation and cabin altitude abnormals'],
    [2, 'Abnormal and Emergency Operations', 'Electrical and hydraulic system abnormals'],
    [2, 'Abnormal and Emergency Operations', 'Rejected take-off'],
    [2, 'Instrument Operations', 'Precision approach, normal and engine-out'],
    [2, 'Instrument Operations', 'Non-precision approach'],
    [2, 'Instrument Operations', 'Missed approach and diversion'],
    [3, 'Line Operations', 'Weight and balance and performance for charter loads'],
    [3, 'Line Operations', 'Passenger briefings and cabin safety'],
    [3, 'Line Operations', 'Short-field and contaminated runway operations'],
    [3, 'Line Operations', 'Fatigue and duty limits awareness'],
    [3, 'Line Operations', 'Crew resource management on the line'],
  ],
  [KING_AIR]: [
    [1, 'Normal Operations', 'Pre-flight inspection and external checks'],
    [1, 'Normal Operations', 'Cockpit preparation and flows'],
    [1, 'Normal Operations', 'Engine and propeller start'],
    [1, 'Normal Operations', 'Taxi, pre-take-off checks and take-off'],
    [1, 'Normal Operations', 'Climb, cruise and descent profile management'],
    [2, 'Abnormal and Emergency Operations', 'Engine failure after take-off and autofeather operation'],
    [2, 'Abnormal and Emergency Operations', 'Propeller overspeed and governor failure'],
    [2, 'Abnormal and Emergency Operations', 'Engine fire on the ground and in flight'],
    [2, 'Abnormal and Emergency Operations', 'Electrical system abnormals'],
    [2, 'Abnormal and Emergency Operations', 'Rejected take-off'],
    [2, 'Instrument Operations', 'Precision approach, normal and single-engine'],
    [2, 'Instrument Operations', 'Non-precision approach'],
    [2, 'Instrument Operations', 'Missed approach and diversion'],
    [3, 'Line Operations', 'Weight and balance and performance for charter loads'],
    [3, 'Line Operations', 'Passenger briefings and cabin safety'],
    [3, 'Line Operations', 'Short and unsealed strip operations'],
    [3, 'Line Operations', 'Fatigue and duty limits awareness'],
    [3, 'Line Operations', 'Crew resource management on the line'],
  ],
};

// Ground School items per fleet: [category, description]. The "Aircraft
// Endorsement" category is special in the app (it sorts last and gates the
// start of LOFT) so it is included for each fleet.
const ENDORSEMENT_TEXT = 'Aircraft type endorsement completed (simulator training and endorsement conducted by a third-party provider) - required before LOFT can commence';
const GROUND_SCHOOL_COMMON = [
  ['Admin', 'Induction completed'],
  ['Admin', 'Operations manual issued'],
  ['Admin', 'Company policies read and acknowledged'],
  ['Course', 'Aircraft systems theory'],
  ['Course', 'Performance and loading'],
  ['Course', 'Emergency procedures theory'],
  ['Course', 'Operational procedures for air transport operations'],
  ['Course', 'Emergency equipment and wet drill'],
  ['Aircraft Endorsement', ENDORSEMENT_TEXT],
];

// Competency types left over from the shared catalogue that name another
// operator or aircraft (matched case-insensitively) - archived in the demo.
const COMPETENCY_ARCHIVE_PATTERNS = ['f100', 'fokker', 'dash', 'metro', 'slide', 'cabin', 'skippers', 'smoke and fir'];

// ---------------------------------------------------------------------------
// Part 135 form content. These are illustrative items for the demonstration
// only - written for a small charter operator, not taken from any real
// operator's forms or manuals. A real customer's own forms replace them.
// ---------------------------------------------------------------------------

// Check to Line (the initial line check for a newly qualified pilot), same
// layout the form already uses: [section, kind, [items...]]. "text" items are
// free-text boxes the examiner fills in (emergency procedures assessed,
// systems discussed). Each fleet also gets one fleet-specific system item.
const CTL_SECTIONS = [
  ['Preflight', 'tick', [
    'Pre-flight and daily inspection (per the flight manual and operator checklist)',
    'Cockpit setup and flows',
    'Flight planning, including weather and NOTAMs',
    'Crew coordination and briefing',
    'Passenger supervision and customer service',
    'Licence, medical and duty times checked',
  ]],
  ['Performance Calculations', 'tick', [
    'Take-off performance and limits',
    'Landing performance and limits',
    'Engine-out and emergency re-calculations',
  ]],
  ['Weight and Balance', 'tick', [
    'Load sheet complete and accurate',
    'Fuel, passenger and baggage distribution within limits',
  ]],
  ['Procedures', 'tick', [
    'Scans and flight instrument monitoring',
    'Checklist use',
    'Standard operating procedures',
    'Radio communication',
    'Knowledge of company manuals',
    'Clear and concise briefings',
  ]],
  ['Route Knowledge', 'tick', [
    'Appropriate use of GNSS and en-route navigation aids',
    'Knowledge of airspace, air traffic services and alternate aerodromes',
  ]],
  ['General Aircraft Handling', 'tick', [
    'Flying accurate and smooth, in line with SOPs',
    'Aircraft systems used correctly',
  ]],
  ['Aircraft System Knowledge', 'tick', ['__FLEET_SYSTEM__']],
  ['Emergency Procedures', 'text', [
    'Emergency procedure 1 assessed',
    'Emergency procedure 2 assessed',
    'Emergency procedure 3 assessed',
  ]],
  ['Instrument Approach 1', 'tick', [
    'Tracking', 'Instrument flying smooth and accurate', 'Configuration',
    'Speed control', 'Vertical profile', 'Crew coordination and standard calls',
  ]],
  ['Instrument Approach 2', 'tick', [
    'Tracking', 'Instrument flying smooth and accurate', 'Configuration',
    'Speed control', 'Vertical profile', 'Crew coordination and standard calls',
  ]],
  ['Maintenance Procedures', 'tick', [
    'Defect reporting and maintenance release procedure',
    'Knowledge of minimum equipment list (MEL) application',
  ]],
  ['Post Flight Duties', 'tick', [
    'Actioned with due care',
    'Coordination with ground handling and maintenance',
  ]],
  ['Aircraft System Knowledge', 'text', ['System discussed 1', 'System discussed 2', 'System discussed 3']],
];

const CTL_FLEET_SYSTEM_ITEM = {
  [CITATION]: 'System: bleed air, pressurisation and anti-ice',
  [KING_AIR]: 'System: propeller governing and autofeather',
};

// The Emergency Procedures form is shared with the original operator and is
// built around cabin and slide items - for the demo aircraft, drop the
// escape-slide item and add three that apply to a small charter aeroplane.
const EP_ARCHIVE_PATTERN = '%escape slide%';
const EP_NEW_ITEMS = [
  'Fire extinguisher selection and use',
  'Oxygen system, and smoke or fumes in the cockpit',
  'Ditching and forced landing procedures',
];

// What the "Check conducted IAW specific Instructor Reference Documents" line
// shows on every form in the demo (replaces the DOC### placeholder).
const DEMO_DOC_REF = 'Demo Air Charter Operations Manual, Part D';

module.exports = {
  CITATION, KING_AIR, STAFF, LINE_PILOTS, LOFT_TRAINEES, SYLLABUS,
  GROUND_SCHOOL_COMMON, COMPETENCY_ARCHIVE_PATTERNS,
  CTL_SECTIONS, CTL_FLEET_SYSTEM_ITEM, EP_NEW_ITEMS, EP_ARCHIVE_PATTERN, DEMO_DOC_REF,
};
