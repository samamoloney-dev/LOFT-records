const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { sendCompetencyDigest, buildDigestHtml } = require('../lib/digest');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

// Manual trigger - lets HOTC/HOFO/Flight Ops Admin/Alternate send the
// competency digest on demand (e.g. to verify RESEND_API_KEY is actually
// configured) instead of only ever finding out at 6am whether it worked.
router.post('/send-now', async (req, res) => {
  const result = await sendCompetencyDigest();
  res.json(result);
});

// Preview the digest's HTML without sending anything - lets an admin see
// exactly what today's email would contain.
router.get('/preview', async (req, res) => {
  const html = await buildDigestHtml();
  res.json({ html });
});

module.exports = router;
