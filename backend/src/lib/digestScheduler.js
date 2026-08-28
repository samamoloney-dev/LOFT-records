// Schedules the daily competency digest email (see lib/digest.js) for
// 6:00am Perth time (AWST, UTC+8, no daylight saving - see lib/currency.js
// OPERATOR_TIMEZONE) every day, per the operator's request. Plain
// setTimeout-based scheduling (recomputed each run rather than a single
// setInterval) rather than a cron library dependency - a fixed daily time
// in a timezone with no DST is a simple enough rule not to need one.
const AWST_OFFSET_HOURS = 8;
const DIGEST_HOUR_AWST = 6;

function msUntilNextRun(now = new Date()) {
  const hourUtc = (DIGEST_HOUR_AWST - AWST_OFFSET_HOURS + 24) % 24; // 6am AWST -> 22:00 UTC the previous day
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleDailyDigest(sendFn) {
  function run() {
    sendFn().catch((err) => console.error('[digest] scheduled send failed', err));
    setTimeout(run, 24 * 60 * 60 * 1000);
  }
  setTimeout(run, msUntilNextRun());
}

module.exports = { scheduleDailyDigest, msUntilNextRun };
