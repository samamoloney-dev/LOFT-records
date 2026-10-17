const { baseFleet } = require('./fleetOrder');

// Exact names the rostering system expects for the recurrent checks in the
// Currency Overview CSV export, per the operator's "Competency Names"
// spreadsheet - these checks are split by aircraft there, while the app
// records one Emergency Procedures / Line Check / IPC / Proficiency Check
// per person. Spelling (including "Proficency") is deliberately verbatim.
// The codes for these live in course_codes, keyed by exact name (loaded by
// migration 0122), and are edited from Edit Forms > Competencies (see
// course-codes.js /checks).
const EP_THEORY = {
  DASH_8: 'Emergency Procedures Theory - Dash 8',
  FOKKER_100: 'Emergency Procedures Theory - F100',
  METRO_23: 'Emergency Procedures Theory - Metro',
};
const EP_PRACTICAL = {
  DASH_8: 'Emergency Procedures Practical - Dash 8',
  FOKKER_100: 'Emergency Procedures Practical -F100',
  METRO_23: 'Emergency Procedures Practical - Metro',
};
const PILOT_LINE_CHECK = {
  DASH_8: 'Line Check - Dash 8',
  FOKKER_100: 'Line Check - F100',
  METRO_23: 'Line Check - Metro',
};
const PROFICIENCY_CHECK = {
  DASH_8: 'Part 121 Proficency Check Dash 8',
  FOKKER_100: 'Part 121 Proficency Check F100',
  METRO_23: 'Part 121 Proficency Check Metro',
};
const IPC = {
  DASH_8: 'Part 121 IPC & Proficency Check Dash 8',
  FOKKER_100: 'Part 121 IPC & Proficency Check F100',
  METRO_23: 'Part 121 IPC & Proficency Check Metro',
};
const CA_LINE_CHECK_DASH_8 = 'Cabin Attendant Dash 8 Line Check';
const CA_LINE_CHECK_FOKKER_100 = 'Cabin Attendant F100 Line Check';
const F100_SLIDE = 'Emergency Procedures Practial Slide F100 Check';

// The 3-yearly Smoke & Fire check (the Smoke & Fire Training form) is the same
// thing as the "3 Yearly Smoke & Fire" course, so it exports under that name.
const SMOKE_FIRE = '3 Yearly Smoke & Fire';
const LIFE_JACKET = 'Life Jacket Training';

// Staff-level competencies tracked on FS Staff rather than the Crew roster
// (see users.js) - added to the export from the staff list.
const GROUND_INSTRUCTOR = 'Competency of Ground Instructor';
const FS_PERSONNEL_PILOT = 'Flight Standards Personnel Competency Check - Pilot';
const FS_PERSONNEL_CABIN = 'Flight Standards Personnel Competency Check - Cabin';

// Every fixed check name the export can produce, in the order shown on the
// Competencies tab.
const CHECK_EXPORT_NAMES = [
  ...Object.values(EP_THEORY),
  ...Object.values(EP_PRACTICAL),
  ...Object.values(PILOT_LINE_CHECK),
  CA_LINE_CHECK_DASH_8,
  CA_LINE_CHECK_FOKKER_100,
  ...Object.values(PROFICIENCY_CHECK),
  ...Object.values(IPC),
  F100_SLIDE,
  SMOKE_FIRE,
  LIFE_JACKET,
  GROUND_INSTRUCTOR,
  FS_PERSONNEL_PILOT,
  FS_PERSONNEL_CABIN,
];

const EP_TYPE_TO_FLEET = { Dash8: 'DASH_8', 'Dash 8': 'DASH_8', 'Fokker 100': 'FOKKER_100', Metro: 'METRO_23' };

function memberBaseFleets(member) {
  return [...new Set((member.fleets || []).map(baseFleet))];
}

// Emergency Procedures is exported only as the parts actually ticked on the
// completed form (Theory and/or a practical per aircraft) - per the operator,
// "only the one that was ticked". A completed form with nothing ticked, or an
// EP that only exists as a seed date, falls back to the practical for the
// person's own fleet(s).
function epNames(member, epDetails) {
  const types = Array.isArray(epDetails?.types) ? epDetails.types : [];
  const practicalFleets = types.filter((t) => t !== 'Theory').map((t) => EP_TYPE_TO_FLEET[t]).filter(Boolean);
  const fleets = memberBaseFleets(member);
  const names = [];
  if (types.includes('Theory')) {
    const theoryFleet = EP_TYPE_TO_FLEET[epDetails?.actype] || practicalFleets[0] || fleets[0];
    if (EP_THEORY[theoryFleet]) names.push(EP_THEORY[theoryFleet]);
  }
  for (const f of practicalFleets) if (EP_PRACTICAL[f]) names.push(EP_PRACTICAL[f]);
  if (names.length === 0) {
    for (const f of fleets) if (EP_PRACTICAL[f]) names.push(EP_PRACTICAL[f]);
  }
  return [...new Set(names)];
}

// The name(s) one currency item is exported under. Competencies keep their
// own name; recurrent checks are split by the person's aircraft.
function exportNamesFor(member, label, epDetails) {
  const fleets = memberBaseFleets(member);
  const perFleet = (table) => {
    const names = fleets.map((f) => table[f]).filter(Boolean);
    return names.length ? names : [label];
  };
  switch (label) {
    case 'Emergency Procedures': return epNames(member, epDetails);
    case 'Line Check': return perFleet(PILOT_LINE_CHECK);
    case 'Proficiency Check': return perFleet(PROFICIENCY_CHECK);
    case 'IPC': return perFleet(IPC);
    case 'F100 Slide Training': return [F100_SLIDE];
    default: return [label];
  }
}

module.exports = {
  CHECK_EXPORT_NAMES,
  GROUND_INSTRUCTOR,
  FS_PERSONNEL_PILOT,
  FS_PERSONNEL_CABIN,
  CA_LINE_CHECK_DASH_8,
  CA_LINE_CHECK_FOKKER_100,
  exportNamesFor,
};
