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
// Cabin Attendant Trainer trains cabin crew but is never the one who signs
// off a Line Check or Check to Line - that's a Checker's job specifically
// (Cabin Attendant Checker or Cabin Attendant Manager, who holds an
// assessor-equivalent role). Excluded outright here regardless of any
// checkAccess tick, the same way Flight Ops Admin is excluded from
// checking entirely below.
const LINE_CHECK_ACCESS_TYPES = ['LINE_CHECK', 'CHECK_TO_LINE'];

export function isEligibleForCheck(staffMember, accessType, fleet) {
  if (ALWAYS_ELIGIBLE_ASSESSOR_ROLES.includes(staffMember.role)) return true;
  if (staffMember.role === 'FLIGHT_OPS_ADMIN') return false;
  if (staffMember.role === 'CA_TRAINER' && LINE_CHECK_ACCESS_TYPES.includes(accessType)) return false;
  // Cabin Attendant Manager is authorised to train and check Emergency
  // Procedures for all pilots and cabin crew, unconditionally - no
  // checkAccess tick or fleet match required, unlike everyone else below.
  if (staffMember.role === 'CA_MANAGER' && accessType === 'EMERGENCY_PROCEDURES') return true;
  if (!(staffMember.checkAccess || []).includes(accessType)) return false;
  return !fleet || (staffMember.fleets || []).includes(fleet);
}
