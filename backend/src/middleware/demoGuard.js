const { profile } = require('../lib/profile');

// Actions switched off on the demonstration site: the demo logins are shared,
// so nobody should be able to change their passwords or delete the accounts
// out from under the next person. (Everything else - saving checks, signing
// forms, adding crew - stays fully usable; the site is reset regularly.)
const BLOCKED = [
  ['POST', /^\/api\/auth\/change-password\/?$/],
  ['POST', /^\/api\/users\/[^/]+\/reset-password\/?$/],
  ['DELETE', /^\/api\/users\/[^/]+\/?$/],
];

function demoGuard(req, res, next) {
  if (!profile.demo) return next();
  if (BLOCKED.some(([method, pattern]) => req.method === method && pattern.test(req.path))) {
    return res.status(403).json({ error: 'This action is switched off on the demonstration site.' });
  }
  return next();
}

module.exports = { demoGuard };
