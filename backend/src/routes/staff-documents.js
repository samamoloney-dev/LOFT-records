const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

// Files filed against an FS Staff member's profile (currently the Examiner
// Proficiency Check paperwork for Simulator Only Examiners) - JPEG or PDF
// only. Admin-only, matching the FS Staff page itself. The list omits the file
// data (kept lightweight); the full file is fetched only when opened.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg'];
const MAX_DATA_CHARS = 14000000; // roughly a 10 MB file once base64-encoded
const KINDS = ['EXAMINER_PROFICIENCY_CHECK', 'PERSONAL_DEVELOPMENT', 'HUMAN_FACTORS_SUPERVISOR', 'PMI'];
const LIST_COLUMNS = 'id, user_id, kind, name, topic, document_date, file_name, mime_type, archived, archived_at, uploaded_by_name, created_at';

function mimeTypeOf(dataUri) {
  const match = /^data:([a-z0-9/+.-]+);base64,/i.exec(dataUri || '');
  return match ? match[1].toLowerCase() : null;
}

const listSchema = z.object({
  userId: z.string().uuid(),
  archived: z.enum(['true', 'false']).optional(),
  kind: z.enum(KINDS).optional(),
});

// kind defaults to the Examiner Proficiency Check files, which is all this
// table held before Personal Development was added. Newest document date
// first (falling back to when it was added), so a topic's latest sitting leads.
router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'userId is required' });
  const { rows } = await pool.query(
    `SELECT ${LIST_COLUMNS} FROM staff_documents WHERE user_id = $1 AND archived = $2 AND kind = $3
     ORDER BY document_date DESC NULLS LAST, created_at DESC`,
    [parsed.data.userId, parsed.data.archived === 'true', parsed.data.kind || 'EXAMINER_PROFICIENCY_CHECK'],
  );
  res.json(rows.map(rowToCamel));
});

const idSchema = z.string().uuid();

router.get('/:id', async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
  const { rows } = await pool.query('SELECT * FROM staff_documents WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rowToCamel(rows[0]));
});

const createSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  fileName: z.string().min(1).max(255),
  fileData: z.string().min(1),
  kind: z.enum(KINDS).optional(),
  // Personal Development files are filed under one of the rotating topics and
  // carry the date that topic was completed.
  topic: z.string().trim().min(1).max(120).nullable().optional(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const mimeType = mimeTypeOf(d.fileData);
  if (!mimeType || !ALLOWED_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: 'Only JPEG or PDF files can be stored here' });
  }
  if (d.fileData.length > MAX_DATA_CHARS) {
    return res.status(400).json({ error: 'That file is too large - the limit is about 10 MB' });
  }

  const kind = d.kind || 'EXAMINER_PROFICIENCY_CHECK';
  if (kind === 'PERSONAL_DEVELOPMENT' && !d.topic) {
    return res.status(400).json({ error: 'Choose the Personal Development topic this file belongs to' });
  }
  if (d.documentDate && (Number.isNaN(Date.parse(d.documentDate)) || d.documentDate > new Date().toISOString().slice(0, 10))) {
    return res.status(400).json({ error: 'The date must be a real date that is not in the future' });
  }

  const { rows: userRows } = await pool.query('SELECT name FROM users WHERE id = $1', [d.userId]);
  if (userRows.length === 0) return res.status(404).json({ error: 'Staff member not found' });

  const { rows } = await pool.query(
    `INSERT INTO staff_documents (user_id, kind, name, topic, document_date, file_name, mime_type, file_data, uploaded_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${LIST_COLUMNS}`,
    [d.userId, kind, d.name, kind === 'PERSONAL_DEVELOPMENT' ? d.topic : null, d.documentDate || null, d.fileName, mimeType, d.fileData, req.user.name],
  );
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'staff_documents', targetId: rows[0].id,
    description: `Uploaded "${d.name}" for ${userRows[0].name}`,
  });
  res.status(201).json(rowToCamel(rows[0]));
});

async function setArchived(req, res, archived) {
  if (!idSchema.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
  const { rows } = await pool.query(
    `UPDATE staff_documents SET archived = $2, archived_at = ${archived ? 'now()' : 'NULL'} WHERE id = $1 RETURNING ${LIST_COLUMNS}`,
    [req.params.id, archived],
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'staff_documents', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
}
router.post('/:id/archive', (req, res) => setArchived(req, res, true));
router.post('/:id/unarchive', (req, res) => setArchived(req, res, false));

module.exports = router;
