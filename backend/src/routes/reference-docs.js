const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { PLACEHOLDER, DEFAULT_FORM_NUMBER, DEFAULT_REVISION, REFERENCE_DOC_FORMS, FORM_KEYS } = require('../lib/referenceDocs');

const router = express.Router();
router.use(requireAuth);

// Every form with its instructor reference (DOC###), form number (SA###) and
// revision - readable by anyone signed in, since each form shows them to
// whoever is filling it in and prints them on every page.
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT form_key, doc_ref, form_number, revision FROM form_reference_docs');
  const byKey = new Map(rows.map((r) => [r.form_key, r]));
  res.json(REFERENCE_DOC_FORMS.map((f) => {
    const r = byKey.get(f.key);
    return {
      formKey: f.key,
      label: f.label,
      docRef: r?.doc_ref || PLACEHOLDER,
      formNumber: r?.form_number || DEFAULT_FORM_NUMBER,
      revision: r?.revision || DEFAULT_REVISION,
    };
  }));
});

const putSchema = z.object({
  docRef: z.string().trim().min(1).max(60).optional(),
  formNumber: z.string().trim().min(1).max(30).optional(),
  revision: z.string().trim().min(1).max(30).optional(),
}).refine((d) => d.docRef || d.formNumber || d.revision, { message: 'Nothing to save' });

// Only the fields sent are changed; the rest keep their current value.
router.put('/:formKey', requireRole(...ADMIN_ROLES), async (req, res) => {
  if (!FORM_KEYS.includes(req.params.formKey)) return res.status(404).json({ error: 'Unknown form' });
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  await pool.query(
    `INSERT INTO form_reference_docs (form_key, doc_ref, form_number, revision)
     VALUES ($1, COALESCE($2, $5), $3, $4)
     ON CONFLICT (form_key) DO UPDATE SET
       doc_ref = COALESCE($2, form_reference_docs.doc_ref),
       form_number = COALESCE($3, form_reference_docs.form_number),
       revision = COALESCE($4, form_reference_docs.revision),
       updated_at = now()`,
    [req.params.formKey, d.docRef ?? null, d.formNumber ?? null, d.revision ?? null, PLACEHOLDER],
  );
  const { rows } = await pool.query('SELECT doc_ref, form_number, revision FROM form_reference_docs WHERE form_key = $1', [req.params.formKey]);
  const label = REFERENCE_DOC_FORMS.find((f) => f.key === req.params.formKey).label;
  const saved = {
    docRef: rows[0].doc_ref || PLACEHOLDER,
    formNumber: rows[0].form_number || DEFAULT_FORM_NUMBER,
    revision: rows[0].revision || DEFAULT_REVISION,
  };
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'form_reference_docs',
    description: `Set ${label} to form ${saved.formNumber}, revision ${saved.revision}, instructor reference "${saved.docRef}"`,
  });
  res.json({ formKey: req.params.formKey, label, ...saved });
});

module.exports = router;
