// Roles that count as "trainer" per the operator's own definition: Training
// Captain, Check Captain, Examiner, Check Cabin Attendant, Trainer Cabin
// Attendant, HOFO and HOTC. Used to gate trainer-only reference material
// (e.g. sign-off guidance notes) that shouldn't be visible to trainees.
export const TRAINER_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER', 'CA_CHECKER', 'CA_TRAINER', 'HOFO', 'HOTC'];

// Pre-Simulator Assessment sign-off is narrower still - only the roles who
// actually fly with the candidate before the simulator. Mirrors
// backend/src/middleware/roles.js's PRE_SIM_ASSESSOR_ROLES.
export const PRE_SIM_ASSESSOR_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER'];

// The Initial Take-Off & Landing Assessment can only be filled in/signed off
// by a Check Captain or Examiner - HOTC/HOFO/Flight Ops Admin can view it
// but not edit it. Mirrors backend/src/middleware/roles.js's
// LANDING_ASSESSMENT_EDIT_ROLES.
export const LANDING_ASSESSMENT_EDIT_ROLES = ['CC', 'EXAMINER'];
