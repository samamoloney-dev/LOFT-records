// Roles that count as "trainer" per the operator's own definition: Training
// Captain, Check Captain, Examiner, Check Cabin Attendant, Trainer Cabin
// Attendant, HOFO and HOTC. Used to gate trainer-only reference material
// (e.g. sign-off guidance notes) that shouldn't be visible to trainees.
export const TRAINER_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER', 'CA_CHECKER', 'CA_TRAINER', 'CA_MANAGER', 'GROUND_INSTRUCTOR', 'HOFO', 'HOTC', 'ALTERNATE'];

// Pre-Simulator Assessment sign-off is narrower still - only the roles who
// actually fly with the candidate before the simulator. Mirrors
// backend/src/middleware/roles.js's PRE_SIM_ASSESSOR_ROLES.
export const PRE_SIM_ASSESSOR_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER'];

// The Initial Take-Off & Landing Assessment can only be filled in/signed off
// by a Check Captain or Examiner - HOTC/HOFO/Flight Ops Admin can view it
// but not edit it. Mirrors backend/src/middleware/roles.js's
// LANDING_ASSESSMENT_EDIT_ROLES.
export const LANDING_ASSESSMENT_EDIT_ROLES = ['CC', 'EXAMINER'];

// Continuous Improvement (post-IPC/PC survey + trend analytics). The
// analytics tab is HOTC/HOFO only (deliberately excludes Flight Ops
// Admin), but the survey itself can be filled in by anyone who can
// conduct a RECURRENT_SIMULATOR check. Mirrors
// backend/src/middleware/roles.js's CONTINUOUS_IMPROVEMENT_ROLES/SURVEY_FILL_ROLES.
// Flight Ops Admin is deliberately excluded from every checking-related
// list below - per the operator's explicit rule, Flight Ops Admin cannot
// conduct any checking. Mirrors backend/src/middleware/roles.js.
export const CONTINUOUS_IMPROVEMENT_ROLES = ['HOTC', 'HOFO', 'ALTERNATE'];
export const SURVEY_FILL_ROLES = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER', 'SIMULATOR_ONLY'];

// Who must hold (and is eligible to conduct) a current Ground Instructor
// Competency Check (SA_520, renewed every 12 months) - per the operator's
// explicit correction, the dedicated Ground Instructor role is exempt (their
// qualification for the role already covers this, so the check itself
// would be redundant on them) - only Simulator Only Examiner and anyone
// individually ticked for Emergency Procedures checkAccess ("EP trainers")
// actually need it. Mirrors backend/src/middleware/roles.js's
// isGroundInstructorCheckEligible.
export function isGroundInstructorCheckEligible(user) {
  return user.role === 'SIMULATOR_ONLY'
    || (user.checkAccess || []).includes('EMERGENCY_PROCEDURES');
}

// Certificate Generator - HOTC/HOFO/Flight Ops Admin/Alternate/Ground
// Instructor plus anyone individually ticked for Emergency Procedures
// checkAccess ("EP trainers" - same flag isGroundInstructorCheckEligible
// above checks), per the operator's explicit request. Managing the
// checklist itself (Syllabus tab) stays ADMIN_ROLES-only - this only gates
// the generator page/GET endpoint. Mirrors backend/src/middleware/
// roles.js's canAccessCertificates.
const CERTIFICATE_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE', 'GROUND_INSTRUCTOR'];
export function canAccessCertificates(user) {
  return CERTIFICATE_ROLES.includes(user.role) || (user.checkAccess || []).includes('EMERGENCY_PROCEDURES');
}

// Mirrors backend/src/middleware/roles.js's CHECK_ROLES (canAccessChecks) -
// who can conduct/assess a check generally, as opposed to who a given check
// applies to.
export const CHECK_ROLES = ['HOTC', 'HOFO', 'ALTERNATE', 'EXAMINER'];

// Cabin Attendant Line Check / Check to Line - mirrors Checks.jsx's own
// CA_CHECK_ROLES (kept here too so App.jsx's nav gate below can't drift
// from the page's own access logic the way it once did).
export const CA_CHECK_ROLES = ['HOTC', 'CA_CHECKER', 'CA_MANAGER'];

// Whether this user can reach the Checks tab AT ALL - i.e. the union of
// every per-check-type gate Checks.jsx itself computes (pilot IPC/PC/EP/
// Line Check/CTL, cabin attendant EP/CTL/Line Check, Ground Instructor/
// Personnel Air Competency). This must stay a superset of - and ideally
// derived the same way as - Checks.jsx's own canAccessPilots/
// canAccessCabinAttendants/canAccessOthers, since this is only used to
// decide whether the "Checks" link even appears in the sidebar (App.jsx) -
// a mismatch there hides the whole page from someone the page itself would
// otherwise let in (e.g. a Check Captain individually ticked for Line
// Check/Check to Line, who has no blanket CHECK_ROLES access but does have
// checkAccess ticks).
export function canAccessChecksTab(user) {
  const isSimulatorOnly = user.role === 'SIMULATOR_ONLY';
  const hasEpAccess = user.role === 'CA_MANAGER' || (user.checkAccess || []).includes('EMERGENCY_PROCEDURES');
  const hasLineCheckAccess = (user.checkAccess || []).includes('LINE_CHECK');
  const hasCheckToLineAccess = (user.checkAccess || []).includes('CHECK_TO_LINE');
  return CHECK_ROLES.includes(user.role)
    || CA_CHECK_ROLES.includes(user.role)
    || isSimulatorOnly
    || hasEpAccess
    || hasLineCheckAccess
    || hasCheckToLineAccess;
}

// Assessor pool on the Ground Instructor Competency Check (SA_520) and
// Flight Standards Personnel (Air) Competency Check (SA_518) forms
// specifically - CHECK_ROLES plus Cabin Attendant Manager, who can
// complete/assess both of these per the operator's explicit request (but
// deliberately not folded into CHECK_ROLES itself, since that would also
// hand CA Manager pilot-only Recurrent Sim/IPC/PC access - see Checks.jsx's
// canAccessPilotChecks). Mirrors backend/src/middleware/roles.js's
// canAccessCompetencyChecks.
export const COMPETENCY_CHECK_ASSESSOR_ROLES = [...CHECK_ROLES, 'CA_MANAGER'];

// Flight Standards Personnel (Air) Competency Check (SA_518) - every staff
// member who trains or checks pilots/cabin crew in the air, renewed every
// 24 months. Examiners are deliberately excluded (unlike
// isGroundInstructorCheckEligible) - they still conduct/assess this check
// (see CHECK_ROLES above), they just don't need it done on themselves.
// Simulator Only Examiner is included - they still check pilots in the
// simulator, just not on the line. Mirrors backend/src/middleware/roles.js's
// PERSONNEL_AIR_COMPETENCY_ROLES.
export const PERSONNEL_AIR_COMPETENCY_ROLES = ['TRAINING_CAPTAIN', 'CC', 'CA_TRAINER', 'CA_CHECKER', 'CA_MANAGER', 'SIMULATOR_ONLY'];

// Upgrade Records (SA 507/510/522/523) - only checkers and examiners
// administer these, per the operator's explicit request. Mirrors
// backend/src/middleware/roles.js's UPGRADE_CHECKER_ROLES.
export const UPGRADE_CHECKER_ROLES = ['CC', 'EXAMINER', 'CA_CHECKER', 'CA_MANAGER'];

// The staff role a candidate is upgraded to once their record is completed
// and passed, and which crew type (PILOT/CABIN_ATTENDANT) is eligible to be
// a candidate for each variant. Mirrors backend/src/middleware/roles.js's
// UPGRADE_VARIANTS.
export const UPGRADE_VARIANTS = {
  TRAINING_CAPTAIN: { targetRole: 'TRAINING_CAPTAIN', crewType: 'PILOT', label: 'Training Captain Upgrade' },
  CHECK_CAPTAIN: { targetRole: 'CC', crewType: 'PILOT', label: 'Check Captain Upgrade' },
  TRAINING_CABIN_ATTENDANT: { targetRole: 'CA_TRAINER', crewType: 'CABIN_ATTENDANT', label: 'Training Cabin Attendant Upgrade' },
  CHECK_CABIN_ATTENDANT: { targetRole: 'CA_CHECKER', crewType: 'CABIN_ATTENDANT', label: 'Check Cabin Attendant Upgrade' },
};
