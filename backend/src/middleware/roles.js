// Role rules per docs/project-brief.md Section 4.

const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];
const CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'EXAMINER'];
const CA_ONLY_ROLES = ['CA_TRAINER', 'CA_CHECKER'];

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

// Training Captain can only edit flight records where they are the named TC.
// This lock applies even to admin roles - there is no override.
function canEditFlight(user, flight) {
  return user.role === 'TRAINING_CAPTAIN' && flight.trainingCaptainId === user.id;
}

// Trainee may acknowledge only their own flight debrief.
function canAcknowledgeFlight(user, flight) {
  return user.role === 'TRAINEE' && !!user.trainee && user.trainee.id === flight.traineeId;
}

module.exports = {
  ADMIN_ROLES,
  CHECK_ROLES,
  CA_ONLY_ROLES,
  requireRole,
  isAdmin,
  canAccessChecks,
  isCaOnlyRole,
  canAccessTraineeRecord,
  canAccessArchived,
  canEditFlight,
  canAcknowledgeFlight,
};
