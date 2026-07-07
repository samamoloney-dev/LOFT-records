// Role rules per docs/project-brief.md Section 4.

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];
const CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER'];
const CA_ONLY_ROLES = ['CA_TRAINER', 'CA_CHECKER'];

// Every role the operator counts as a "trainer": Training Captain, Check
// Captain, Examiner, Check Cabin Attendant, Trainer Cabin Attendant, HOFO
// and HOTC - deliberately excludes Flight Ops Admin.
const TRAINER_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER', 'CA_CHECKER', 'CA_TRAINER', 'HOFO', 'HOTC'];

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
// (canAccessChecks/CHECK_ROLES). These are the staff who must hold a
// current Ground Instructor Competency Check (SA_520), renewed every 12
// months.
const GROUND_INSTRUCTOR_CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER'];

// Continuous Improvement (post-IPC/PC candidate survey + trend analytics)
// is deliberately narrower than the usual admin trio - Flight Ops Admin is
// excluded, per the operator's explicit request. The survey itself can be
// filled in by whoever can already conduct a RECURRENT_SIMULATOR check
// (mirrors checks.js canAccessCheckType).
const CONTINUOUS_IMPROVEMENT_ROLES = ['HOTC', 'HOFO'];
const SURVEY_FILL_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER', 'SIMULATOR_ONLY'];

// Staff-profile check access ticks (Staff page). These decide which staff
// show up as selectable assessors/assignees on each check form - they don't
// change who can access the Checks tab itself (still role-based, above).
const CHECK_ACCESS_TYPES = ['PC', 'IPC', 'LINE_CHECK', 'CHECK_TO_LINE', 'EMERGENCY_PROCEDURES'];

// Anyone who trains or checks trainees (pilot or cabin crew side) can log a
// flight. Combined with canAccessTraineeRecord below, CA Trainer/CA Checker
// are still limited to Cabin Attendant trainees only.
const FLIGHT_CREATOR_ROLES = [
  'HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER',
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
