const express = require('express');
const { profile } = require('../lib/profile');

const router = express.Router();

// Public (no login needed) - the login page itself shows the operator's name
// and the demo banner, and the frontend needs the fleet list before anyone
// signs in. Nothing here is sensitive: it is the same wording every user of
// the deployment sees on screen anyway.
router.get('/', (req, res) => {
  res.json({
    id: profile.id,
    operatorName: profile.operatorName,
    productName: profile.productName,
    timezone: profile.timezone,
    aircraftTypes: profile.aircraftTypes,
    epTypes: profile.epTypes,
    fleets: profile.fleets,
    features: profile.features,
    logo: profile.logo,
    demo: profile.demo,
    banner: profile.banner,
  });
});

module.exports = router;
