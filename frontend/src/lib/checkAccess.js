export const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// HOTC/HOFO/Alternate are always eligible for every check type and every
// fleet. Flight Ops Admin is deliberately excluded - unlike the ADMIN_ROLES
// above (which still governs who can administer/assign checks), they
// cannot conduct any checking themselves, so they never appear as an
// assessor here even if ticked.
const ALWAYS_ELIGIBLE_ASSESSOR_ROLES = ['HOTC', 'HOFO', 'ALTERNATE'];

// Everyone else needs the matching tick on their staff profile for the
// check type, and - when a fleet is known (a specific trainee/crew member) -
// a matching fleet tick too. `fleet` is optional: ad-hoc/free-text checks
// that aren't tied to a specific trainee/crew member don't have one, and
// skip the fleet check entirely (unchanged from before this existed).
// Training Cabin Attendant trains cabin crew but is never the one who signs
// off a Line Check or Check to Line - that's a Checker's job specifically
// (Check Cabin Attendant or Cabin Attendant Manager, who holds an
// assessor-equivalent role). Excluded outright here regardless of any
// checkAccess tick, the same way Flight Ops Admin is excluded from
// checking entirely below.
const LINE_CHECK_ACCESS_TYPES = ['LINE_CHECK', 'CHECK_TO_LINE'];

// SA 538 assesses an Examiner/Check Captain/Training Captain's own
// instructional technique during a simulator session - per the operator's
// explicit request, only Examiner/Simulator Only Examiner plus HOTC/HOFO
// can actually be picked to conduct/sign it off, unlike every other check
// type here where Alternate is always eligible too. Alternate/Flight Ops
// Admin still create, assign and manage the record itself (see checks.js's
// canAccessCheckType/isAdmin gates) - this only narrows who shows up in
// the Assigned to/Assessor pickers.
const FLIGHT_STANDARDS_RECURRENT_TRAINING_ASSESSOR_ROLES = ['EXAMINER', 'SIMULATOR_ONLY', 'HOTC', 'HOFO'];

export function isEligibleForCheck(staffMember, accessType, fleet) {
  if (accessType === 'FLIGHT_STANDARDS_RECURRENT_TRAINING') {
    return FLIGHT_STANDARDS_RECURRENT_TRAINING_ASSESSOR_ROLES.includes(staffMember.role);
  }
  // Emergency Procedures, wet drills (Life Jacket), 3-yearly Smoke & Fire and
  // F100 Slide training can only be conducted by staff holding the CASA
  // 121.010 approval - the "Emergency procedures" tick on their FS Staff
  // profile. No role qualifies without it (not HOTC, HOFO, Alternate,
  // Examiners or the Cabin Attendant Manager), and the approval isn't
  // fleet-specific. Mirrors backend/src/lib/epApproval.js.
  if (accessType === 'EMERGENCY_PROCEDURES') {
    return (staffMember.checkAccess || []).includes('EMERGENCY_PROCEDURES');
  }
  if (ALWAYS_ELIGIBLE_ASSESSOR_ROLES.includes(staffMember.role)) return true;
  if (staffMember.role === 'FLIGHT_OPS_ADMIN') return false;
  if (staffMember.role === 'CA_TRAINER' && LINE_CHECK_ACCESS_TYPES.includes(accessType)) return false;
  if (!(staffMember.checkAccess || []).includes(accessType)) return false;
  return !fleet || (staffMember.fleets || []).includes(fleet);
}
