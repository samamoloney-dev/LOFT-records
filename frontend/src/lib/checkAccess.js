export const ADMIN_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN'];

// HOTC/HOFO/Flight Ops Admin are always eligible for every check type.
// Everyone else needs the matching tick on their staff profile.
export function isEligibleForCheck(staffMember, accessType) {
  if (ADMIN_ROLES.includes(staffMember.role)) return true;
  return (staffMember.checkAccess || []).includes(accessType);
}
