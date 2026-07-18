// Shared between crew.js (crew_member_id-scoped) and trainees.js
// (trainee_id-scoped) clearance routes - same stage lists and signer rule
// either way, see crew_clearances' one-subject check constraint (migration
// 0083) for why an entry attaches to exactly one of the two.
const PILOT_CLEARANCE_STAGES = ['AIRCRAFT_CONVERSION', 'LINE_TRAINING', 'TRAINING_CAPTAIN', 'CHECK_CAPTAIN'];
const CA_CLEARANCE_STAGES = ['GROUND_SCHOOL', 'LINE_TRAINING', 'CA_TRAINER', 'CA_CHECKER'];

// Signing off a clearance stage is restricted to HOTC/HOFO specifically -
// tighter than the general admin gate, since this is meant to mirror an
// actual FSM/HOFO signature on the paper form (SA 586 pilots / SA 539
// cabin attendants).
function isClearanceSigner(user) {
  return user.role === 'HOTC' || user.role === 'HOFO';
}

module.exports = { PILOT_CLEARANCE_STAGES, CA_CLEARANCE_STAGES, isClearanceSigner };
