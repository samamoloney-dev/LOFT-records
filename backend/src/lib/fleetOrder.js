// Cabin attendants start qualified on Dash 8 and can only add Fokker 100
// once they hold Dash 8 (a real-world conversion-course requirement, not a
// check type this app tracks) - pilots aren't constrained this way. Shared
// by crew.js (direct fleet edits) and trainees.js (merging a new fleet into
// an existing crew member's record once they complete a return-to-LOFT
// conversion - see /:id/promote-to-crew).
function fleetOrderError(type, fleets) {
  if (type === 'CABIN_ATTENDANT' && fleets.includes('CA_FOKKER_100') && !fleets.includes('CA_DASH_8')) {
    return 'Cabin attendants must be qualified on Dash 8 before Fokker 100 can be added';
  }
  return null;
}

module.exports = { fleetOrderError };
