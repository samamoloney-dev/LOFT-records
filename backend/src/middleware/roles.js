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
// Cabin Attendant Manager joins CA Trainer/CA Checker as CA-scoped-only for
// general trainee/crew record access (see canAccessTraineeRecord below) -
// their Emergency Procedures authority for pilots is granted separately
// (see checks.js canAccessCheckType and lib/checkAccess.js isEligibleForCheck),
// since that's deliberately not fleet-scoped.
const CA_ONLY_ROLES = ['CA_TRAINER', 'CA_CHECKER', 'CA_MANAGER'];

// Every role the operator counts as a "trainer": Training Captain, Check
// Captain, Examiner, Check Cabin Attendant, Trainer Cabin Attendant, Cabin
// Attendant Manager, Ground Instructor, HOFO, HOTC and Alternate -
// deliberately excludes Flight Ops Admin.
const TRAINER_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER', 'CA_CHECKER', 'CA_TRAINER', 'CA_MANAGER', 'GROUND_INSTRUCTOR', 'HOFO', 'HOTC', 'ALTERNATE'];

// Pre-Simulator Assessment sign-off is narrower still - only the roles who
// actually fly with the candidate before the simulator.
const PRE_SIM_ASSESSOR_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER'];

// The Initial Take-Off & Landing Assessment (SA_575, Fokker 100/Dash 8
// pilot trainees) can only be filled in and signed off by a Check Captain
// or Examiner - unlike Check to Line, HOTC/HOFO/Flight Ops Admin do not
// get an editing exception here, only view access via canAccessTraineeRecord.
const LANDING_ASSESSMENT_EDIT_ROLES = ['CC', 'EXAMINER'];

// Who must hold (and is eligible to conduct) a current Ground Instructor
// Competency Check (SA_520, renewed every 12 months) - the dedicated
// Ground Instructor role, Cabin Attendant Checker/Manager ("checkers"),
// admins/Examiner (canAccessChecks), and anyone else individually ticked
// for Emergency Procedures checkAccess on their Staff profile ("EP
// trainers") - rather than a fixed role list, since a Training Captain or
// similar might also train/check EP without that being their primary job.
function isGroundInstructorCheckEligible(user) {
  return user.role === 'GROUND_INSTRUCTOR'
    || user.role === 'CA_CHECKER'
    || user.role === 'CA_MANAGER'
    || canAccessChecks(user)
    || (user.checkAccess || []).includes('EMERGENCY_PROCEDURES');
}

// Flight Standards Personnel (Air) Competency Check (SA_518) - every staff
// member who trains or checks pilots/cabin crew in the air must hold a
// current one, renewed every 24 months. Unlike isGroundInstructorCheckEligible,
// Examiners are deliberately excluded - per the operator's explicit request,
// Examiners do not require this check (they still conduct/assess it, since
// that's gated by canAccessChecks/CHECK_ROLES below, not this list). Simulator
// Only Examiner is included, per the operator's explicit request - they
// still check pilots in the simulator, just not on the line.
const PERSONNEL_AIR_COMPETENCY_ROLES = ['TRAINING_CAPTAIN', 'CC', 'CA_TRAINER', 'CA_CHECKER', 'CA_MANAGER', 'SIMULATOR_ONLY'];

// Which SA_518 form sub-section (2a/2b/3a/3b) applies to a given eligible
// role - fixed per check at creation time (see personnel-checks.js) so a
// later role change doesn't rewrite history.
const PERSONNEL_AIR_COMPETENCY_SECTION = {
  TRAINING_CAPTAIN: 'TRAINING_PILOT',
  CC: 'CHECK_PILOT',
  CA_TRAINER: 'TRAINING_CABIN_CREW',
  CA_CHECKER: 'CHECK_CABIN_CREW',
  // Cabin Attendant Manager covers both training and checking - CHECK_CABIN_CREW
  // is the more senior of the two sections, same rationale as a Check Cabin
  // Attendant covering a Trainer's scope.
  CA_MANAGER: 'CHECK_CABIN_CREW',
  // Simulator Only Examiner only ever checks (never trains) - mirrors Check
  // Captain's own section.
  SIMULATOR_ONLY: 'CHECK_PILOT',
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
  'TRAINING_CAPTAIN', 'CA_TRAINER', 'CA_CHECKER', 'CA_MANAGER',
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

// Ground Instructor Competency Check (SA_520) and Personnel (Air)
// Competency Check (SA_518) specifically - Cabin Attendant Manager can
// complete/assess both of these (per the operator's explicit request),
// unlike the broader canAccessChecks (which also covers pilot-only
// Recurrent Sim/EP access CA Manager must NOT get - see
// canAccessCheckType's EMERGENCY_PROCEDURES/RECURRENT_SIMULATOR handling
// in checks.js, which grants CA Manager EP access separately and on
// purpose but keeps them out of Recurrent Sim). Deliberately its own
// function rather than widening canAccessChecks itself.
function canAccessCompetencyChecks(user) {
  return canAccessChecks(user) || user.role === 'CA_MANAGER';
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

// Only whoever created a flight record may edit it - this lock does not
// transfer just because someone else also holds a flight-creator role.
// Admins keep an override, same as every other assignee-style lock in this
// app (checks.js/ctl.js's own assignedTo) - without it, a flight opened by
// an admin (e.g. during onboarding/setup) or by a trainer no longer around
// to finish it would sit open forever, permanently blocking that trainee's
// next flight for everyone (see the CA Trainer "one open flight at a time"
// rule this can otherwise deadlock).
function canEditFlight(user, flight) {
  return flight.trainingCaptainId === user.id || isAdmin(user);
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
  isGroundInstructorCheckEligible,
  PERSONNEL_AIR_COMPETENCY_ROLES,
  PERSONNEL_AIR_COMPETENCY_SECTION,
  CONTINUOUS_IMPROVEMENT_ROLES,
  SURVEY_FILL_ROLES,
  CHECK_ACCESS_TYPES,
  FLIGHT_CREATOR_ROLES,
  requireRole,
  isAdmin,
  canAccessChecks,
  canAccessCompetencyChecks,
  isCaOnlyRole,
  canAccessTraineeRecord,
  canAccessArchived,
  canEditFlight,
  canAcknowledgeFlight,
};
