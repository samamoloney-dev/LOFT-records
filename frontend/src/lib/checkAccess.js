export const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE'];

// HOTC/HOFO/Flight Ops Admin are always eligible for every check type and
// every fleet. Everyone else needs the matching tick on their staff profile
// for the check type, and - when a fleet is known (a specific trainee/crew
// member) - a matching fleet tick too. `fleet` is optional: ad-hoc/free-text
// checks that aren't tied to a specific trainee/crew member don't have one,
// and skip the fleet check entirely (unchanged from before this existed).
export function isEligibleForCheck(staffMember, accessType, fleet) {
  if (ADMIN_ROLES.includes(staffMember.role)) return true;
  if (!(staffMember.checkAccess || []).includes(accessType)) return false;
  return !fleet || (staffMember.fleets || []).includes(fleet);
}
