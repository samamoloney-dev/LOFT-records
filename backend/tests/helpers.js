import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';

export const PASSWORD = 'password123';

export async function createUser({ name = 'Test User', email, role, fleetAccess = 'ALL' }) {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, fleet_access)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, email, passwordHash, role, fleetAccess],
  );
  return rows[0];
}

export async function createTrainee({ firstName = 'Trainee', lastName = 'One', type = 'PILOT', role = 'FIRST_OFFICER', fleet = 'DASH_8', phase = 1 }) {
  const { rows } = await pool.query(
    `INSERT INTO trainees (first_name, last_name, type, role, fleet, phase)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [firstName, lastName, type, role, fleet, phase],
  );
  return rows[0];
}

export async function loginAgent(agent, email) {
  const res = await agent.post('/api/auth/login').send({ email, password: PASSWORD });
  return res;
}
