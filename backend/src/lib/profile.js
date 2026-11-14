// Operator profile - the per-deployment settings that differ between one
// airline's installation and another's (name, fleets, timezone, which
// feature sets are switched on). Chosen by the OPERATOR_PROFILE environment
// variable; with it unset the app behaves exactly as it always has for
// Skippers, so a deployment that never sets it is unaffected.
//
// The frontend reads the same profile from GET /api/config (see
// routes/config.js) before it renders anything, so the fleet pickers,
// navigation and wording always agree with what the backend will accept.

// Every fleet value the database's `fleet` enum can hold. Request
// validation uses this superset - an operator's own fleets are a subset of
// it - so adding an operator never loosens or tightens validation for
// another. (Adding a new aircraft type for a future operator means adding a
// value here and a migration that extends the Postgres enum.)
const ALL_FLEET_VALUES = [
  'DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100',
  'CITATION_550', 'KING_AIR_B200',
];

const PROFILES = {
  skippers: {
    id: 'skippers',
    operatorName: 'Skippers Aviation PTY LTD',
    productName: 'Flight Standards System',
    // The operator is in Perth (AWST, UTC+8, no daylight saving) - see
    // lib/currency.js for why "today" has to be the operator's own date.
    timezone: 'Australia/Perth',
    // The aircraft-type names the check forms offer (in this order), and the
    // Emergency Procedures form's own spellings - both match what the forms
    // store in details.actype (see routes/crew.js FLEET_TO_AIRCRAFT_TYPE).
    aircraftTypes: ['Fokker 100', 'Dash 8', 'Metro'],
    epTypes: ['Theory', 'Metro', 'Dash8', 'Fokker 100'],
    fleets: [
      { code: 'DASH_8', label: 'Dash 8', crew: 'PILOT' },
      { code: 'FOKKER_100', label: 'Fokker 100', crew: 'PILOT' },
      { code: 'METRO_23', label: 'Metro', crew: 'PILOT' },
      { code: 'CA_DASH_8', label: 'Cabin Dash 8', crew: 'CABIN_ATTENDANT' },
      { code: 'CA_FOKKER_100', label: 'Cabin Fokker 100', crew: 'CABIN_ATTENDANT' },
    ],
    features: {
      cabinAttendants: true,
      // Wording/behaviour specific to an air transport (Part 121) operator,
      // e.g. the CASA 121.010 emergency procedures approval.
      part121: true,
      // The Clearance Form tab on a crew profile (F100/DHC8/Metro clearance sign-off).
      clearanceForm: true,
    },
    // Which logo the printed forms and certificates carry: 'skippers' (the
    // embedded Skippers logo) or null (the operator name set as text).
    logo: 'skippers',
  },

  // A fictional CASA Part 135 (smaller aeroplane air transport) operator,
  // used for the demonstration site. Two pilot-only fleets, no cabin crew.
  demo135: {
    id: 'demo135',
    operatorName: 'Demo Air Charter',
    productName: 'Flight Standards System',
    timezone: 'Australia/Brisbane',
    aircraftTypes: ['Citation 550', 'King Air B200'],
    epTypes: ['Theory', 'Citation 550', 'King Air B200'],
    fleets: [
      { code: 'CITATION_550', label: 'Cessna Citation 550', crew: 'PILOT' },
      { code: 'KING_AIR_B200', label: 'Beechcraft King Air B200', crew: 'PILOT' },
    ],
    features: {
      cabinAttendants: false,
      part121: false,
      clearanceForm: false,
    },
    logo: null,
  },
};

const requestedId = (process.env.OPERATOR_PROFILE || 'skippers').trim();
const base = PROFILES[requestedId];
if (!base) {
  throw new Error(`Unknown OPERATOR_PROFILE "${requestedId}" (expected one of: ${Object.keys(PROFILES).join(', ')})`);
}

// DEMO_MODE marks a throwaway demonstration deployment: it shows a banner,
// switches off the riskiest actions (see middleware/demoGuard.js) and is the
// only mode the demo seed script will run in. It is never set in production.
const demo = String(process.env.DEMO_MODE || '').toLowerCase() === 'true';

const profile = {
  ...base,
  demo,
  banner: demo ? 'DEMONSTRATION SITE - all people, records and documents shown are fictional.' : null,
};

const PILOT_FLEET_VALUES = profile.fleets.filter((f) => f.crew === 'PILOT').map((f) => f.code);
const CA_FLEET_VALUES = profile.fleets.filter((f) => f.crew === 'CABIN_ATTENDANT').map((f) => f.code);
// The fleets this operator actually offers, in display order.
const OFFERED_FLEET_VALUES = profile.fleets.map((f) => f.code);

module.exports = {
  profile,
  ALL_FLEET_VALUES,
  OFFERED_FLEET_VALUES,
  PILOT_FLEET_VALUES,
  CA_FLEET_VALUES,
};
