// Fills a DEMONSTRATION database with fictional data: two staff logins, ten
// pilot profiles (eight line pilots and two in LOFT), syllabi for both
// fleets, competency dates and sample documents.
//
// Safety: this refuses to run unless the deployment has DEMO_MODE=true (and
// the OPERATOR_PROFILE it was built for) - see assertDemoDeployment. It wipes
// every record table first, so it must never be pointed at a real database.
//
// Most of the data is created through the app's own HTTP API (on a private
// loopback listener) rather than hand-written SQL, so it goes through exactly
// the same validation and business rules as data entered by a person and
// keeps working as the schema evolves. Each step is isolated: one failing
// step is logged and the rest still run.

const http = require('http');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const pool = require('../pool');
const { profile } = require('../../src/lib/profile');
const { issueToken } = require('../../src/middleware/auth');
const content = require('./demo-content');

// Catalogue/configuration tables - kept as they are. Everything else (people,
// check records, progress, audit log, syllabus and ground school items, ...)
// is wiped and re-seeded.
const KEEP_TABLES = [
  'schema_migrations', 'check_form_items', 'survey_questions', 'fstd_presets',
  'certificate_checklist_items', 'personal_development_topics', 'document_name_options',
  'form_reference_docs', 'course_codes', 'phase', 'specialist_training_items',
  'training_syllabi', 'competency_types',
];

function assertDemoDeployment() {
  if (!profile.demo || profile.id !== 'demo135') {
    throw new Error('Refusing to seed: this is not a demonstration deployment (needs DEMO_MODE=true and OPERATOR_PROFILE=demo135).');
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Refusing to seed: set DEMO_PASSWORD (at least 8 characters) - it is the shared password for the demo logins.');
  }
  if (!process.env.JWT_SECRET) throw new Error('Refusing to seed: JWT_SECRET is not set.');
}

function isoDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

async function wipeData(log) {
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  let pending = rows.map((r) => r.table_name).filter((t) => !KEEP_TABLES.includes(t));
  // Delete child tables before the tables they reference: a delete that hits a
  // foreign key is retried on the next pass, after its children are gone.
  for (let pass = 0; pass < 15 && pending.length > 0; pass += 1) {
    const failed = [];
    for (const table of pending) {
      try {
        await pool.query(`DELETE FROM "${table}"`);
      } catch (err) {
        if (err.code === '23503') failed.push(table); else throw err;
      }
    }
    if (failed.length === pending.length) break;
    pending = failed;
  }
  if (pending.length > 0) throw new Error(`Could not clear: ${pending.join(', ')}`);
  log(`cleared ${rows.length - KEEP_TABLES.length} record tables`);
}

// The shared competency catalogue still carries a few entries named after
// another operator or aircraft - rename or archive them for the demo.
async function tidyCatalogue(log) {
  await pool.query(
    `UPDATE competency_types SET name = trim(replace(name, 'Skippers Aviation', ''))
     WHERE name ILIKE '%skippers aviation%'
       AND NOT EXISTS (SELECT 1 FROM competency_types c2 WHERE c2.name = trim(replace(competency_types.name, 'Skippers Aviation', '')))`,
  );
  const patterns = content.COMPETENCY_ARCHIVE_PATTERNS.map((p) => `%${p}%`);
  const where = patterns.map((_, i) => `lower(name) LIKE $${i + 1}`).join(' OR ');
  await pool.query(`UPDATE competency_types SET archived = true WHERE ${where}`, patterns);
  await pool.query("UPDATE competency_types SET archived = true WHERE applies_to = 'CABIN_ATTENDANT'");
  log('tidied competency catalogue');
}

function samplePdfDataUri(title) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(`data:application/pdf;base64,${Buffer.concat(chunks).toString('base64')}`));
    doc.on('error', reject);
    doc.fontSize(26).text('SAMPLE DOCUMENT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(15).text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text('Fictional document generated for the demonstration site. It does not relate to any real person.', { align: 'center' });
    doc.end();
  });
}

async function withLocalApi(fn) {
  // Required lazily: server.js loads the routes, one of which loads this file.
  const app = require('../../src/server');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function resetDemo({ log = console.log } = {}) {
  assertDemoDeployment();
  const started = Date.now();
  const failures = [];

  await wipeData(log);
  await tidyCatalogue(log);

  // ---- staff logins (direct insert: the API needs a signed-in user to exist first)
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD, 10);
  const staffIds = {};
  for (const s of content.STAFF) {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, arn, fleets, check_access)
       VALUES ($1, $2, $3, $4, $5, $6::fleet[], $7::check_access_type[]) RETURNING id`,
      [s.name, s.email, passwordHash, s.role, s.arn, s.fleets, s.checkAccess],
    );
    staffIds[s.key] = rows[0].id;
  }
  log(`created ${content.STAFF.length} staff logins`);

  const token = issueToken({ id: staffIds.hotc });

  await withLocalApi(async (base) => {
    async function call(method, path, body) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch { /* keep text */ }
      if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${typeof data === 'string' ? data : JSON.stringify(data)}`);
      return data;
    }
    async function step(name, fn) {
      try {
        const n = await fn();
        log(`ok   ${name}${n === undefined ? '' : ` (${n})`}`);
      } catch (err) {
        failures.push(`${name}: ${err.message}`);
        log(`FAIL ${name}: ${err.message}`);
      }
    }

    await step('LOFT syllabus items', async () => {
      let n = 0;
      for (const [fleet, items] of Object.entries(content.SYLLABUS)) {
        for (const [phase, category, description] of items) {
          await call('POST', '/api/syllabus/items', { fleet, roleScope: 'BOTH', phase, category, section: 'SYLLABUS', description, required: true });
          n += 1;
        }
      }
      return n;
    });

    await step('Ground School items', async () => {
      let n = 0;
      for (const fleet of [content.CITATION, content.KING_AIR]) {
        for (const [category, description] of content.GROUND_SCHOOL_COMMON) {
          await call('POST', '/api/ground-school/items', { fleet, category, description, required: true });
          n += 1;
        }
      }
      return n;
    });

    const crewIds = {};
    await step('line pilots', async () => {
      for (const p of content.LINE_PILOTS) {
        const created = await call('POST', '/api/crew', {
          firstName: p.first, lastName: p.last, type: 'PILOT', role: p.role, fleets: [p.fleet], arn: p.arn,
          lastEpDate: isoDay(-p.epAgo), lastIpcDate: isoDay(-p.ipcAgo), lastPcDate: isoDay(-p.pcAgo),
          lineCheckAnchorDate: isoDay(-p.lineAgo),
          userId: p.staff ? staffIds[p.staff] : undefined,
        });
        crewIds[p.arn] = created.id;
      }
      return content.LINE_PILOTS.length;
    });

    await step('LOFT trainees', async () => {
      for (const t of content.LOFT_TRAINEES) {
        await call('POST', '/api/trainees', {
          firstName: t.first, lastName: t.last, type: 'PILOT', role: t.role, fleet: t.fleet, newHire: true, arn: t.arn,
        });
      }
      return content.LOFT_TRAINEES.length;
    });

    await step('competency dates', async () => {
      const types = (await call('GET', '/api/competency-types')).filter(
        (t) => !t.archived && (!t.appliesTo || t.appliesTo === 'PILOT'),
      );
      let n = 0;
      let pilotIndex = 0;
      for (const p of content.LINE_PILOTS) {
        const memberId = crewIds[p.arn];
        if (memberId) {
          let typeIndex = 0;
          const staffRole = p.staff ? content.STAFF.find((s) => s.key === p.staff).role : null;
          // Skip types scoped to other fleets or to staff roles this pilot does not hold.
          const applicable = types.filter((t) => (
            (!t.fleets || t.fleets.length === 0 || t.fleets.includes(p.fleet))
            && (!t.staffRoles || t.staffRoles.length === 0 || (staffRole && t.staffRoles.includes(staffRole)))
          ));
          for (const t of applicable) {
            // Deterministic spread of dates: mostly current, a few close to
            // expiry, and one-in-eleven overdue, so every status shows up.
            const overdue = (pilotIndex + typeIndex) % 11 === 0;
            const completedAgo = overdue ? 420 : 20 + ((typeIndex * 37 + pilotIndex * 23) % 300);
            await call('PUT', `/api/crew/${memberId}/competencies/${t.id}`, {
              completedDate: isoDay(-completedAgo),
              dueDate: isoDay(365 - completedAgo),
            });
            n += 1;
            typeIndex += 1;
          }
        }
        pilotIndex += 1;
      }
      return n;
    });

    await step('sample documents', async () => {
      const licence = await samplePdfDataUri('Pilot licence copy');
      const medical = await samplePdfDataUri('Medical certificate');
      let n = 0;
      for (const p of content.LINE_PILOTS) {
        const memberId = crewIds[p.arn];
        if (!memberId) continue;
        await call('POST', `/api/crew/${memberId}/documents`, { name: 'Pilot Licence', fileName: 'licence-sample.pdf', fileData: licence });
        await call('POST', `/api/crew/${memberId}/documents`, { name: 'Medical Certificate', fileName: 'medical-sample.pdf', fileData: medical });
        n += 2;
      }
      return n;
    });
  });

  log(`demo data ready in ${((Date.now() - started) / 1000).toFixed(1)}s${failures.length ? ` with ${failures.length} failed step(s)` : ''}`);
  return { failures };
}

async function demoHasUsers() {
  const { rows } = await pool.query('SELECT 1 FROM users LIMIT 1');
  return rows.length > 0;
}

module.exports = { resetDemo, demoHasUsers };
