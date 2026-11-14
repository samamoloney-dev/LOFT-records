// Operator profile - the per-deployment settings (operator name, fleets,
// aircraft types, which feature sets are on) that differ between one
// airline's installation and another's. The backend owns the real values
// (backend/src/lib/profile.js, served at GET /api/config); this module
// fetches them once, before the app renders (see main.jsx), and everything
// else reads from here.
//
// DEFAULT_PROFILE is exactly what the app has always been - Skippers'
// five fleets, cabin attendants on, Part 121 wording. If the config request
// fails for any reason (older backend, network blip) the app simply carries
// on with these defaults, so a deployment that doesn't use profiles at all
// behaves exactly as before.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const DEFAULT_PROFILE = {
  id: 'skippers',
  operatorName: 'Skippers Aviation PTY LTD',
  productName: 'Flight Standards System',
  timezone: 'Australia/Perth',
  aircraftTypes: ['Fokker 100', 'Dash 8', 'Metro'],
  epTypes: ['Theory', 'Metro', 'Dash8', 'Fokker 100'],
  fleets: [
    { code: 'DASH_8', label: 'Dash 8', crew: 'PILOT' },
    { code: 'FOKKER_100', label: 'Fokker 100', crew: 'PILOT' },
    { code: 'METRO_23', label: 'Metro', crew: 'PILOT' },
    { code: 'CA_DASH_8', label: 'Cabin Dash 8', crew: 'CABIN_ATTENDANT' },
    { code: 'CA_FOKKER_100', label: 'Cabin Fokker 100', crew: 'CABIN_ATTENDANT' },
  ],
  features: { cabinAttendants: true, part121: true, clearanceForm: true },
  logo: 'skippers',
  demo: false,
  banner: null,
};

// Mutated in place (never reassigned) so every module that imported these
// sees the loaded values, including array constants captured at import time.
export const profile = { ...DEFAULT_PROFILE, features: { ...DEFAULT_PROFILE.features }, fleets: [] };
export const AIRCRAFT_TYPES = [];
export const EP_TYPES = [];

function apply(p) {
  const next = { ...DEFAULT_PROFILE, ...p, features: { ...DEFAULT_PROFILE.features, ...(p.features || {}) } };
  for (const key of Object.keys(next)) {
    if (key === 'fleets' || key === 'features') continue;
    profile[key] = next[key];
  }
  profile.features = next.features;
  profile.fleets.length = 0;
  profile.fleets.push(...(next.fleets || DEFAULT_PROFILE.fleets));
  AIRCRAFT_TYPES.length = 0;
  AIRCRAFT_TYPES.push(...next.aircraftTypes);
  EP_TYPES.length = 0;
  EP_TYPES.push(...next.epTypes);
}
apply(DEFAULT_PROFILE);

export async function loadProfile() {
  try {
    const res = await fetch(`${API_URL}/api/config`);
    if (res.ok) {
      apply(await res.json());
      if (profile.productName) document.title = profile.productName;
      if (profile.banner) document.body.style.paddingTop = '28px';
    }
  } catch {
    // Keep the defaults - see the comment at the top of this file.
  }
}

// The operator's fleet codes, arranged in the order a page has always shown
// them. `preferred` is that page's own original order; fleets this operator
// doesn't have are dropped and any extra ones it does have go on the end, so
// for Skippers the result is identical to the old hard-coded list. `crew`
// optionally limits it to PILOT or CABIN_ATTENDANT fleets.
export function orderedFleets(preferred, crew) {
  const offered = profile.fleets.filter((f) => !crew || f.crew === crew).map((f) => f.code);
  const first = preferred.filter((code) => offered.includes(code));
  return [...first, ...offered.filter((code) => !first.includes(code))];
}

export function hasCabinAttendants() {
  return !!profile.features.cabinAttendants;
}

export function fleetLabelFromProfile(code) {
  const found = profile.fleets.find((f) => f.code === code);
  return found ? found.label : undefined;
}
