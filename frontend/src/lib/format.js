// British date format (dd/mm/yyyy) throughout the app, rather than
// relying on the browser's locale (which would render US-style m/d/yyyy).
export function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Human-readable labels for enum values that are otherwise displayed to
// users with raw underscores (e.g. "CA_DASH_8", "FIRST_OFFICER"). The
// underlying values stay as-is in the database/API - these only affect
// what's shown on screen.
const FLEET_LABELS = {
  DASH_8: 'Dash 8',
  FOKKER_100: 'Fokker 100',
  METRO_23: 'Metro 23',
  CA_DASH_8: 'Dash 8',
  CA_FOKKER_100: 'Fokker 100',
  ALL: 'All fleets',
};

const TRAINEE_ROLE_LABELS = {
  PILOT: 'Pilot',
  CAPTAIN: 'Captain',
  FIRST_OFFICER: 'First Officer',
  CABIN_ATTENDANT: 'Cabin Attendant',
};

const USER_ROLE_LABELS = {
  HOTC: 'HOTC',
  HOFO: 'HOFO',
  FLIGHT_OPS_ADMIN: 'Flight Ops Admin',
  EXAMINER: 'Examiner',
  TRAINING_CAPTAIN: 'Training Captain',
  CA_TRAINER: 'Cabin Attendant Trainer',
  CA_CHECKER: 'Cabin Attendant Checker',
  CC: 'Check Captain',
  SIMULATOR_ONLY: 'Simulator Only',
  TRAINEE: 'Trainee',
};

export function formatFleet(fleet) {
  return FLEET_LABELS[fleet] || fleet;
}

export function formatTraineeRole(role) {
  return TRAINEE_ROLE_LABELS[role] || role;
}

export function formatUserRole(role) {
  return USER_ROLE_LABELS[role] || role;
}
