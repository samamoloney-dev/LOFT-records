// A crew member's own fleets column is meant to hold the plain DASH_8/
// FOKKER_100 values (same as a pilot's) - but some records (and every
// trainee's `fleet` field) instead carry the CA_DASH_8/CA_FOKKER_100
// values reserved for CA checking/training staff (see FsStaff.jsx's
// FleetAccessPicker comment, and CaChecks.jsx's identical normalisation for
// the same reason). Comparing here without normalising meant this check
// silently never fired for a plain-valued CA record (the common case), and
// - worse - produced a false positive when merging a trainee's CA_-prefixed
// fleet into an existing crew member's plain-valued fleets during
// promote-to-crew: someone genuinely holding DASH_8 read as not holding it
// at all, since the array never contained the literal string CA_DASH_8.
function baseFleet(fleet) {
  return fleet === 'CA_DASH_8' ? 'DASH_8' : fleet === 'CA_FOKKER_100' ? 'FOKKER_100' : fleet;
}

// Cabin attendants start qualified on Dash 8 and can only add Fokker 100
// once they hold Dash 8 (a real-world conversion-course requirement, not a
// check type this app tracks) - pilots aren't constrained this way. Shared
// by crew.js (direct fleet edits) and trainees.js (merging a new fleet into
// an existing crew member's record once they complete a return-to-LOFT
// conversion - see /:id/promote-to-crew).
function fleetOrderError(type, fleets) {
  const normalised = fleets.map(baseFleet);
  if (type === 'CABIN_ATTENDANT' && normalised.includes('FOKKER_100') && !normalised.includes('DASH_8')) {
    return 'Cabin attendants must be qualified on Dash 8 before Fokker 100 can be added';
  }
  return null;
}

module.exports = { fleetOrderError, baseFleet };
