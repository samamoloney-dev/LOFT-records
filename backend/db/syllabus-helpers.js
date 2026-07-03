// Shared helpers for building fleet syllabus data files (dash8-syllabus.js,
// metro23-syllabus.js, f100-syllabus.js).
//
// roleScope follows each document's Captain/FO distinction (the applicant's
// assigned seat), not the PF/MP (or PF/PNF) in-flight role - every applicant,
// Captain or FO track, practices both roles across different legs, so
// PF/MP-labelled items are role_scope BOTH. A few items genuinely differ by
// phase depending on the applicant's seat (e.g. "1CAPT | 3FO" in the
// document) - those are modelled as two separate rows via splitItem, one
// CAPTAIN_ONLY and one FO_ONLY, each with its own phase.

const SYLLABUS = 'SYLLABUS';
const DISCUSSION = 'DISCUSSION';
const BOTH = 'BOTH';
const CAPTAIN_ONLY = 'CAPTAIN_ONLY';
const FO_ONLY = 'FO_ONLY';

function item(category, roleScope, phase, description, notes, section = SYLLABUS) {
  return { category, section, roleScope, phase, description, notes: notes || null, required: true };
}

// Items that split 1CAPT / nFO - same description, two rows.
function splitItem(category, description, captainPhase, foPhase, notes) {
  return [
    item(category, CAPTAIN_ONLY, captainPhase, description, notes),
    item(category, FO_ONLY, foPhase, description, notes),
  ];
}

module.exports = { SYLLABUS, DISCUSSION, BOTH, CAPTAIN_ONLY, FO_ONLY, item, splitItem };
