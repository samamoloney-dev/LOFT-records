const { localDateString } = require('./currency');

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

// Is this date later than today for the operator? A bare calendar date
// (YYYY-MM-DD) is compared as a Perth calendar day - read as midnight UTC it
// would be 8am Perth, so "today" typed before 8am Perth time looked like the
// future. A full timestamp is compared as the moment it is. An unreadable value
// counts as invalid (true).
function isFutureDate(value) {
  const s = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s > localDateString();
  const ms = Date.parse(s);
  return Number.isNaN(ms) || ms > Date.now();
}

module.exports = { isPlausibleDate, isFutureDate };
