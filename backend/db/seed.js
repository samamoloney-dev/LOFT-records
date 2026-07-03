require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const dash8Syllabus = require('./dash8-syllabus');
const metro23Syllabus = require('./metro23-syllabus');
const f100Syllabus = require('./f100-syllabus');

const DEMO_PASSWORD = 'password123';

async function upsertUser({ name, email, role, fleetAccess }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, fleet_access)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET name = $1
     RETURNING *`,
    [name, email, passwordHash, role, fleetAccess],
  );
  return rows[0];
}

async function main() {
  const hotc = await upsertUser({ name: 'Alex Reid', email: 'hotc@loft.example', role: 'HOTC', fleetAccess: 'ALL' });
  await upsertUser({ name: 'Examiner Smith', email: 'examiner.smith@loft.example', role: 'EXAMINER', fleetAccess: 'ALL' });
  const tc = await upsertUser({ name: 'TC Jones', email: 'tc.jones@loft.example', role: 'TRAINING_CAPTAIN', fleetAccess: 'DASH_8' });
  await upsertUser({ name: 'CA Trainer Davies', email: 'ca.trainer.davies@loft.example', role: 'CA_TRAINER', fleetAccess: 'ALL' });
  await upsertUser({ name: 'CA Checker Patel', email: 'ca.checker.patel@loft.example', role: 'CA_CHECKER', fleetAccess: 'ALL' });

  const traineeSeeds = [
    { firstName: 'Jamie', lastName: 'Carter', type: 'PILOT', role: 'FIRST_OFFICER', fleet: 'DASH_8', phase: 1 },
    { firstName: 'Morgan', lastName: 'Lee', type: 'PILOT', role: 'CAPTAIN', fleet: 'FOKKER_100', phase: 2 },
    { firstName: 'Priya', lastName: 'Nair', type: 'CABIN_ATTENDANT', role: 'CABIN_ATTENDANT', fleet: 'CA_DASH_8', phase: 1 },
  ];

  const trainees = [];
  for (const t of traineeSeeds) {
    const { rows } = await pool.query(
      `INSERT INTO trainees (first_name, last_name, type, role, fleet, phase)
       SELECT $1, $2, $3, $4, $5, $6
       WHERE NOT EXISTS (SELECT 1 FROM trainees WHERE first_name = $1 AND last_name = $2)
       RETURNING *`,
      [t.firstName, t.lastName, t.type, t.role, t.fleet, t.phase],
    );
    if (rows[0]) trainees.push(rows[0]);
  }

  const allSyllabusSeeds = [
    ...dash8Syllabus.map((s) => ({ ...s, fleet: 'DASH_8' })),
    ...metro23Syllabus.map((s) => ({ ...s, fleet: 'METRO_23' })),
    ...f100Syllabus.map((s) => ({ ...s, fleet: 'FOKKER_100' })),
  ];

  for (const s of allSyllabusSeeds) {
    await pool.query(
      `INSERT INTO syllabus_items (fleet, role_scope, phase, category, section, description, notes, required)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8
       WHERE NOT EXISTS (
         SELECT 1 FROM syllabus_items
         WHERE fleet = $1 AND role_scope = $2 AND phase = $3 AND category = $4 AND description = $6
       )`,
      [s.fleet, s.roleScope, s.phase, s.category, s.section, s.description, s.notes || null, s.required ?? true],
    );
  }

  if (trainees[0]) {
    await pool.query(
      `INSERT INTO flights (trainee_id, training_captain_id, date, sector_details, hours)
       SELECT $1, $2, CURRENT_DATE, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM flights WHERE trainee_id = $1)`,
      [trainees[0].id, tc.id, JSON.stringify({ departure: 'YSSY', arrival: 'YMML' }), 2.5],
    );
  }

  console.log('Seed complete. Demo login password for all users:', DEMO_PASSWORD);
  console.log(`  ${hotc.email} (HOTC)`);
  console.log(`  ${tc.email} (TRAINING_CAPTAIN)`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => pool.end());
