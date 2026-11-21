const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const store = require('../lib/fileStore');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

// The tables whose uploads can live in S3, with the prefix their keys use.
const TABLES = [
  { table: 'crew_documents', prefix: 'crew-documents', ownerColumn: 'crew_member_id' },
  { table: 'staff_documents', prefix: 'staff-documents', ownerColumn: 'user_id' },
];

async function counts() {
  const out = {};
  for (const t of TABLES) {
    const { rows } = await pool.query(
      `SELECT count(*) FILTER (WHERE storage_key IS NOT NULL) AS in_s3,
              count(*) FILTER (WHERE storage_key IS NULL AND file_data IS NOT NULL) AS in_database_only,
              count(*) FILTER (WHERE storage_key IS NOT NULL AND file_data IS NOT NULL) AS in_both
       FROM ${t.table}`,
    );
    out[t.table] = { inS3: Number(rows[0].in_s3), inDatabaseOnly: Number(rows[0].in_database_only), inBoth: Number(rows[0].in_both) };
  }
  return out;
}

// Is S3 switched on, and does it really work? Writes a tiny test file to the
// bucket and reads it back - the check to run after the bucket and keys are set
// in Render. Shows no keys, only the bucket name and region.
router.get('/status', async (req, res) => {
  const result = { configured: store.isConfigured(), bucket: store.bucket() || null, region: store.region(), roundTrip: null, documents: await counts() };
  if (result.configured) {
    const key = `healthcheck/${Date.now()}-${crypto.randomUUID()}.txt`;
    const text = 'Flight Standards System storage check';
    try {
      await store.putBuffer(key, Buffer.from(text), 'text/plain');
      const back = await store.loadFileData({ storage_key: key });
      const ok = Buffer.from(back.split(',')[1], 'base64').toString() === text;
      result.roundTrip = ok ? { ok: true } : { ok: false, error: 'The file read back did not match what was written' };
    } catch (err) {
      result.roundTrip = { ok: false, error: `${err.name}: ${err.message}` };
    }
  }
  res.json(result);
});

const migrateSchema = z.object({
  // How many files to copy in one call (each is up to ~10 MB), so a call stays quick.
  batch: z.number().int().min(1).max(25).optional(),
  // Also empty the database copy of every file that is safely in S3. Only do
  // this once you have looked at a few documents and are happy with them.
  clearDatabaseCopies: z.boolean().optional(),
});

// Copies existing database-stored documents to S3, a batch at a time (call it
// again until nothing remains). A file is only marked as stored in S3 once the
// uploaded object is confirmed to be the same size. The database copy is kept
// unless clearDatabaseCopies is set.
router.post('/migrate', async (req, res) => {
  if (!store.isConfigured()) return res.status(400).json({ error: 'S3 is not set up - set S3_BUCKET (and the AWS keys) in Render first' });
  const parsed = migrateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const batch = parsed.data.batch || 10;

  const summary = { copied: 0, failed: [], cleared: 0 };
  let left = batch;
  for (const t of TABLES) {
    if (left <= 0) break;
    const { rows } = await pool.query(
      `SELECT id, name, file_name, file_data, ${t.ownerColumn} AS owner_id FROM ${t.table}
       WHERE storage_key IS NULL AND file_data IS NOT NULL ORDER BY created_at LIMIT $1`,
      [left],
    );
    for (const row of rows) {
      left -= 1;
      try {
        const parsedFile = store.parseDataUri(row.file_data);
        if (!parsedFile) throw new Error('not a base64 data URI');
        const key = `${t.prefix}/${row.owner_id}/${crypto.randomUUID()}/${store.safeName(row.file_name)}`;
        await store.putBuffer(key, parsedFile.buffer, parsedFile.contentType);
        const size = await store.objectSize(key);
        if (size !== parsedFile.buffer.length) throw new Error(`size mismatch (${size} vs ${parsedFile.buffer.length})`);
        await pool.query(`UPDATE ${t.table} SET storage_key = $1 WHERE id = $2`, [key, row.id]);
        summary.copied += 1;
      } catch (err) {
        summary.failed.push({ table: t.table, id: row.id, name: row.name, error: err.message });
      }
    }
  }

  if (parsed.data.clearDatabaseCopies) {
    for (const t of TABLES) {
      const { rows } = await pool.query(
        `SELECT id, storage_key, file_data FROM ${t.table} WHERE storage_key IS NOT NULL AND file_data IS NOT NULL LIMIT 50`,
      );
      for (const row of rows) {
        try {
          const expected = store.parseDataUri(row.file_data).buffer.length;
          if ((await store.objectSize(row.storage_key)) !== expected) throw new Error('size mismatch');
          await pool.query(`UPDATE ${t.table} SET file_data = NULL WHERE id = $1`, [row.id]);
          summary.cleared += 1;
        } catch (err) {
          summary.failed.push({ table: t.table, id: row.id, error: `not cleared: ${err.message}` });
        }
      }
    }
  }

  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'crew_documents',
    description: `Copied ${summary.copied} document(s) to S3${summary.cleared ? `, cleared ${summary.cleared} database copies` : ''}${summary.failed.length ? `, ${summary.failed.length} failed` : ''}`,
  });
  res.json({ ...summary, documents: await counts() });
});

module.exports = router;
