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

module.exports = {
  CITATION, KING_AIR, STAFF, LINE_PILOTS, LOFT_TRAINEES, SYLLABUS,
  GROUND_SCHOOL_COMMON, COMPETENCY_ARCHIVE_PATTERNS,
};
