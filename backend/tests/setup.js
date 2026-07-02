import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

import fs from 'fs';
import { beforeEach } from 'vitest';
import pool from '../db/pool.js';

const migrationSql = fs.readFileSync(
  path.join(__dirname, '..', 'db', 'migrations', '0001_init.sql'),
  'utf8',
);

let migrated = false;

async function resetDatabase() {
  if (!migrated) {
    const { rows } = await pool.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
    `);
    if (rows.length === 0) {
      await pool.query(migrationSql);
    }
    migrated = true;
  } else {
    await pool.query(`
      TRUNCATE TABLE audit_log, checks, check_to_line_forms, flights,
        syllabus_progress, syllabus_items, trainees, users
      RESTART IDENTITY CASCADE;
    `);
  }
}

beforeEach(async () => {
  await resetDatabase();
});
