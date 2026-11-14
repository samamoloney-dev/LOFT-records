// Runs before the server starts on the demonstration deployment (see
// render-demo.yaml): fills an empty database with the fictional demo data.
// It never fails the deploy - if anything goes wrong it logs and exits 0 so
// the site still starts - and does nothing on a database that already has
// users, or on any deployment that is not a demo.
require('dotenv').config();
const { profile } = require('../../src/lib/profile');

async function main() {
  if (!profile.demo) {
    console.log('demo bootstrap: not a demo deployment, nothing to do');
    return;
  }
  const pool = require('../pool');
  const { resetDemo, demoHasUsers } = require('./seed-demo');
  try {
    if (await demoHasUsers()) {
      console.log('demo bootstrap: database already seeded, leaving it as it is');
      return;
    }
    await resetDemo();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('demo bootstrap failed (the site will still start):', err);
}).finally(() => process.exit(0));
