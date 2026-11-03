const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');
const { PLACEHOLDER, REFERENCE_DOC_FORMS, FORM_KEYS } = require('../lib/referenceDocs');

const router = express.Router();
router.use(requireAuth);

// Every form with its current reference - readable by anyone signed in, since
// each check form shows the line to whoever is filling it in.
router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT form_key, doc_ref FROM form_reference_docs');
  const byKey = new Map(rows.map((r) => [r.form_key, r.doc_ref]));
  res.json(REFERENCE_DOC_FORMS.map((f) => ({ formKey: f.key, label: f.label, docRef: byKey.get(f.key) || PLACEHOLDER })));
});

const putSchema = z.object({ docRef: z.string().trim().min(1).max(60) });

router.put('/:formKey', requireRole(...ADMIN_ROLES), async (req, res) => {
  if (!FORM_KEYS.includes(req.params.formKey)) return res.status(404).json({ error: 'Unknown form' });
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await pool.query(
    `INSERT INTO form_reference_docs (form_key, doc_ref) VALUES ($1, $2)
     ON CONFLICT (form_key) DO UPDATE SET doc_ref = $2, updated_at = now()`,
    [req.params.formKey, parsed.data.docRef],
  );
  const label = REFERENCE_DOC_FORMS.find((f) => f.key === req.params.formKey).label;
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'form_reference_docs',
    description: `Set the instructor reference document for ${label} to "${parsed.data.docRef}"`,
  });
  res.json({ formKey: req.params.formKey, label, docRef: parsed.data.docRef });
});

module.exports = router;
