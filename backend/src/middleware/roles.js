// Role rules per docs/project-brief.md Section 4.

// Alternate: a staff role with the same access as HOTC/HOFO everywhere in
// the app, with one deliberate exception - it cannot sign the Clearance
// Form (see crew.js isClearanceSigner), which stays HOTC/HOFO-only.
const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];
// Flight Ops Admin is deliberately excluded here (and from every other
// checking-related list below) - per the operator's explicit rule, Flight
// Ops Admin cannot conduct any checking. They keep every other admin
// capability (ADMIN_ROLES above) - archiving, editing records, etc. - just
// not this one.
const CHECK_ROLES = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER'];
const CA_ONLY_ROLES = ['CA_TRAINER', 'CA_CHECKER'];

// Every role the operator counts as a "trainer": Training Captain, Check
// Captain, Examiner, Check Cabin Attendant, Trainer Cabin Attendant, HOFO,
// HOTC and Alternate - deliberately excludes Flight Ops Admin.
const TRAINER_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER', 'CA_CHECKER', 'CA_TRAINER', 'HOFO', 'HOTC', 'ALTERNATE'];

// Pre-Simulator Assessment sign-off is narrower still - only the roles who
// actually fly with the candidate before the simulator.
const PRE_SIM_ASSESSOR_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER'];

// The Initial Take-Off & Landing Assessment (SA_575, Fokker 100/Dash 8
// pilot trainees) can only be filled in and signed off by a Check Captain
// or Examiner - unlike Check to Line, HOTC/HOFO/Flight Ops Admin do not
// get an editing exception here, only view access via canAccessTraineeRecord.
const LANDING_ASSESSMENT_EDIT_ROLES = ['CC', 'EXAMINER'];

// Every role the operator counts as able to check/train Emergency
// Procedures - mirrors checks.js's canAccessCheckType default branch
// (canAccessChecks/CHECK_ROLES), plus CA Trainer/CA Checker who train and
// check cabin attendant Emergency Procedures. These are the staff who must
// hold a current Ground Instructor Competency Check (SA_520), renewed
// every 12 months. Flight Ops Admin excluded - see CHECK_ROLES above.
const GROUND_INSTRUCTOR_CHECK_ROLES = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER', 'CA_TRAINER', 'CA_CHECKER'];

// Flight Standards Personnel (Air) Competency Check (SA_518) - every staff
// member who trains or checks pilots/cabin crew in the air must hold a
// current one, renewed every 24 months. Unlike GROUND_INSTRUCTOR_CHECK_ROLES,
// Examiners are deliberately excluded - per the operator's explicit request,
// Examiners do not require this check (they still conduct/assess it, since
// that's gated by canAccessChecks/CHECK_ROLES below, not this list).
const PERSONNEL_AIR_COMPETENCY_ROLES = ['TRAINING_CAPTAIN', 'CC', 'CA_TRAINER', 'CA_CHECKER'];

// Which SA_518 form sub-section (2a/2b/3a/3b) applies to a given eligible
// role - fixed per check at creation time (see personnel-checks.js) so a
// later role change doesn't rewrite history.
const PERSONNEL_AIR_COMPETENCY_SECTION = {
  TRAINING_CAPTAIN: 'TRAINING_PILOT',
  CC: 'CHECK_PILOT',
  CA_TRAINER: 'TRAINING_CABIN_CREW',
  CA_CHECKER: 'CHECK_CABIN_CREW',
};

// Continuous Improvement (post-IPC/PC candidate survey + trend analytics)
// is deliberately narrower than the usual admin trio - Flight Ops Admin is
// excluded, per the operator's explicit request. The survey itself can be
// filled in by whoever can already conduct a RECURRENT_SIMULATOR check
// (mirrors checks.js canAccessCheckType).
const CONTINUOUS_IMPROVEMENT_ROLES = ['HOTC', 'HOFO', 'ALTERNATE'];
// Flight Ops Admin excluded - see CHECK_ROLES above.
const SURVEY_FILL_ROLES = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER', 'SIMULATOR_ONLY'];

// Staff-profile check access ticks (Staff page). These decide which staff
// show up as selectable assessors/assignees on each check form - they don't
// change who can access the Checks tab itself (still role-based, above).
const CHECK_ACCESS_TYPES = ['PC', 'IPC', 'LINE_CHECK', 'CHECK_TO_LINE', 'EMERGENCY_PROCEDURES'];

// Anyone who trains or checks trainees (pilot or cabin crew side) can log a
// flight. Combined with canAccessTraineeRecord below, CA Trainer/CA Checker
// are still limited to Cabin Attendant trainees only.
const FLIGHT_CREATOR_ROLES = [
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE', 'EXAMINER',
  'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER',
];

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

function canAccessChecks(user) {
  return CHECK_ROLES.includes(user.role);
}

function isCaOnlyRole(user) {
  return CA_ONLY_ROLES.includes(user.role);
}

// CA Trainer / CA Checker manage Cabin Attendant records only, and cannot
// create or view Pilot records.
function canAccessTraineeRecord(user, trainee) {
  if (isCaOnlyRole(user)) {
    return trainee.type === 'CABIN_ATTENDANT';
  }
  return true;
}

// Archived records are visible only to HOTC, HOFO, Flight Ops Admin.
function canAccessArchived(user) {
  return isAdmin(user);
}

// Only whoever created a flight record may edit it - this lock applies
// regardless of role (even HOTC), and does not transfer if someone else
// with a flight-creator role tries to edit it.
function canEditFlight(user, flight) {
  return flight.trainingCaptainId === user.id;
}

// Trainee may acknowledge only their own flight debrief.
function canAcknowledgeFlight(user, flight) {
  return user.role === 'TRAINEE' && !!user.trainee && user.trainee.id === flight.traineeId;
}

module.exports = {
  ADMIN_ROLES,
  CHECK_ROLES,
  CA_ONLY_ROLES,
  TRAINER_ROLES,
  PRE_SIM_ASSESSOR_ROLES,
  LANDING_ASSESSMENT_EDIT_ROLES,
  GROUND_INSTRUCTOR_CHECK_ROLES,
  PERSONNEL_AIR_COMPETENCY_ROLES,
  PERSONNEL_AIR_COMPETENCY_SECTION,
  CONTINUOUS_IMPROVEMENT_ROLES,
  SURVEY_FILL_ROLES,
  CHECK_ACCESS_TYPES,
  FLIGHT_CREATOR_ROLES,
  requireRole,
  isAdmin,
  canAccessChecks,
  isCaOnlyRole,
  canAccessTraineeRecord,
  canAccessArchived,
  canEditFlight,
  canAcknowledgeFlight,
};
