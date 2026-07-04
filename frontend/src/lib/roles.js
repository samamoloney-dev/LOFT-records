// Roles that count as "trainer" per the operator's own definition: Training
// Captain, Check Captain, Examiner, Check Cabin Attendant, Trainer Cabin
// Attendant, HOFO and HOTC. Used to gate trainer-only reference material
// (e.g. sign-off guidance notes) that shouldn't be visible to trainees.
export const TRAINER_ROLES = ['TRAINING_CAPTAIN', 'CC', 'EXAMINER', 'CA_CHECKER', 'CA_TRAINER', 'HOFO', 'HOTC'];
