const express = require('express');
const crypto = require('crypto');
const { profile } = require('../lib/profile');

const router = express.Router();

// POST /api/demo/reset - puts the demonstration site back to its starting
// data. Mounted only when DEMO_MODE is on (see server.js), and protected by a
// separate secret (DEMO_RESET_TOKEN, sent as the x-demo-reset-token header) so
// only the site owner - or a scheduled job they set up - can trigger it.
let resetting = false;

router.post('/reset', async (req, res) => {
  const expected = process.env.DEMO_RESET_TOKEN || '';
  const given = String(req.headers['x-demo-reset-token'] || '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!profile.demo) return res.status(404).json({ error: 'Not found' });
  if (resetting) return res.status(409).json({ error: 'A reset is already running' });

  resetting = true;
  const lines = [];
  try {
    const { resetDemo } = require('../../db/demo/seed-demo');
    const { failures } = await resetDemo({ log: (line) => { lines.push(line); console.log(`[demo reset] ${line}`); } });
    res.json({ ok: failures.length === 0, failures, log: lines });
  } finally {
    resetting = false;
  }
});

module.exports = router;
