// Roles that count as "trainer" per the operator's own definition: Training
// Captain, Check Captain, Examiner, Check Cabin Attendant, Trainer Cabin
// Attendant, HOFO and HOTC. Used to gate trainer-only reference material
// (e.g. sign-off guidance notes) that shouldn't be visible to trainees.
export const TRAINER_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER', 'CA_CHECKER', 'CA_TRAINER', 'HOFO', 'HOTC', 'ALTERNATE'];

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
export const CONTINUOUS_IMPROVEMENT_ROLES = ['HOTC', 'HOFO', 'ALTERNATE'];
export const SURVEY_FILL_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE', 'EXAMINER', 'SIMULATOR_ONLY'];

// Every role eligible to check/train Emergency Procedures - these are the
// staff who must hold a current Ground Instructor Competency Check
// (SA_520, renewed every 12 months), and also who can conduct one on a
// colleague. Mirrors backend/src/middleware/roles.js's
// GROUND_INSTRUCTOR_CHECK_ROLES.
export const GROUND_INSTRUCTOR_CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE', 'EXAMINER'];

// Mirrors backend/src/middleware/roles.js's CHECK_ROLES (canAccessChecks) -
// who can conduct/assess a check generally, as opposed to who a given check
// applies to. Used as the Assessor pool on the Ground Instructor Competency
// Check (SA_520) and Flight Standards Personnel (Air) Competency Check
// (SA_518) forms.
export const CHECK_ROLES = ['HOTC', 'HOFO', 'FLIGHT_OPS_ADMIN', 'ALTERNATE', 'EXAMINER'];

// Flight Standards Personnel (Air) Competency Check (SA_518) - every staff
// member who trains or checks pilots/cabin crew in the air, renewed every
// 24 months. Examiners are deliberately excluded (unlike
// GROUND_INSTRUCTOR_CHECK_ROLES) - they still conduct/assess this check
// (see CHECK_ROLES above), they just don't need it done on themselves.
// Mirrors backend/src/middleware/roles.js's PERSONNEL_AIR_COMPETENCY_ROLES.
export const PERSONNEL_AIR_COMPETENCY_ROLES = ['TRAINING_CAPTAIN', 'CC', 'CA_TRAINER', 'CA_CHECKER'];
