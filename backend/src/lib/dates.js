// A mistyped date (e.g. a five-digit year, "20226-05-13") is accepted by the
// database but wrecks every due-date calculation and the CSV export - one
// reached a live Emergency Procedures check. Used to reject those at the API.
// Blank is fine (it means "clear the date").
function isPlausibleDate(value) {
  if (value === '' || value === null || value === undefined) return true;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return false;
  const year = new Date(ms).getUTCFullYear();
  return year >= 2000 && year <= 2100;
}

module.exports = { isPlausibleDate };
