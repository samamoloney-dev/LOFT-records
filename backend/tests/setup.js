import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

import fs from 'fs';
import { beforeEach } from 'vitest';
import pool from '../db/pool.js';

const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

let migrated = false;

async function resetDatabase() {
  if (!migrated) {
    const { rows } = await pool.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
    `);
    if (rows.length === 0) {
      for (const file of migrationFiles) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await pool.query(sql);
      }
    }
    migrated = true;
  } else {
    await pool.query(`
      TRUNCATE TABLE audit_log, checks, check_to_line_forms, phase_completions,
        flight_syllabus_progress, syllabus_category_notes, phase4_assessments,
        ground_school_progress, ground_school_items,
        flights, syllabus_progress, syllabus_items, trainees, users
      RESTART IDENTITY CASCADE;
    `);
  }
}

beforeEach(async () => {
  await resetDatabase();
});
