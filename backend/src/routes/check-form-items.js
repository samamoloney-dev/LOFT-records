const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

const FORM_KEYS = [
  'EMERGENCY_PROCEDURES', 'PROFICIENCY_CHECK', 'CABIN_ATTENDANT_LINE_CHECK',
  'CHECK_TO_LINE', 'GROUND_INSTRUCTOR_COMPETENCY', 'PILOT_LINE_CHECK',
  'PERSONNEL_AIR_COMPETENCY',
  // Upgrade Record briefing checklists (SA 507/510/522/523) - one form key
  // per variant, same UPGRADE_RECORD variant keys used in checks.js/
  // roles.js (see UpgradeRecordForm.jsx).
  'UPGRADE_TRAINING_CAPTAIN', 'UPGRADE_CHECK_CAPTAIN',
  'UPGRADE_TRAINING_CABIN_ATTENDANT', 'UPGRADE_CHECK_CABIN_ATTENDANT',
  // SA 507's FSM E5.2.3 required simulator training (General Handling +
  // Simulated Control Difficulty) - Training Captain upgrade only.
  'UPGRADE_TRAINING_CAPTAIN_SIMULATOR',
];
// tick: plain S/X. score_code: NTS marker (score + code). text: a free-text
// answer (e.g. which aircraft system was discussed). score: a plain 1-5
// numeric score with no code (Pilot Line Check's Non-Technical Skill
// Assessment markers).
const ITEM_KINDS = ['tick', 'score_code', 'text', 'score'];
const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

// Anyone who can reach a check form needs to be able to read its item
// list (Examiners/Training Captains/CA Checkers etc, not just HOTC/HOFO/
// Flight Ops Admin) - only managing the catalog itself is admin-only. See
// EpChecks.jsx/ProficiencyChecks.jsx/CaChecks.jsx for how these are
// rendered as the actual check forms.
router.get('/', async (req, res) => {
  const { formKey, fleet } = req.query;
  if (formKey && !FORM_KEYS.includes(formKey)) return res.status(400).json({ error: 'Unknown form key' });
  if (fleet && !FLEET_VALUES.includes(fleet)) return res.status(400).json({ error: 'Unknown fleet' });
  const includeArchived = req.query.includeArchived === 'true';

  const conditions = [];
  const params = [];
  if (formKey) { params.push(formKey); conditions.push(`form_key = $${params.length}`); }
  // OR fleet IS NULL so a form that mixes universal items with a handful
  // of fleet-specific ones (Pilot Line Check) gets both when filtered to
  // one fleet - Check to Line (the only other caller that passes fleet)
  // has no universal rows, so this is a no-op there.
  if (fleet) { params.push(fleet); conditions.push(`(fleet IS NULL OR fleet = $${params.length})`); }
  if (!includeArchived) conditions.push('archived = false');

  const { rows } = await pool.query(
    `SELECT * FROM check_form_items ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY fleet ASC NULLS FIRST, sort_order ASC, created_at ASC`,
    params,
  );
  res.json(rows.map(rowToCamel));
});

const createSchema = z.object({
  formKey: z.enum(FORM_KEYS),
  fleet: z.enum(FLEET_VALUES).nullable().optional(),
  section: z.string().nullable().optional(),
  kind: z.enum(ITEM_KINDS).optional(),
  description: z.string().min(1),
  notes: z.string().nullable().optional(),
  mos: z.string().nullable().optional(),
  ipcOnly: z.boolean().optional(),
});

router.post('/', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM check_form_items WHERE form_key = $1 AND fleet IS NOT DISTINCT FROM $2',
    [d.formKey, d.fleet || null],
  );
  const { rows } = await pool.query(
    `INSERT INTO check_form_items (form_key, fleet, section, kind, description, notes, mos, ipc_only, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [d.formKey, d.fleet || null, d.section || null, d.kind || 'tick', d.description, d.notes || null, d.mos || null, d.ipcOnly || false, maxRows[0].next],
  );
  const item = rowToCamel(rows[0]);
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'check_form_items', targetId: item.id,
    description: `Added check form item "${item.description}"`,
  });
  res.status(201).json(item);
});

const updateSchema = z.object({
  fleet: z.enum(FLEET_VALUES).nullable().optional(),
  section: z.string().nullable().optional(),
  kind: z.enum(ITEM_KINDS).optional(),
  description: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  mos: z.string().nullable().optional(),
  ipcOnly: z.boolean().optional(),
  archived: z.boolean().optional(),
});
const COLUMN_MAP = {
  fleet: 'fleet', section: 'section', kind: 'kind', description: 'description',
  notes: 'notes', mos: 'mos', ipcOnly: 'ipc_only', archived: 'archived',
};

router.patch('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE check_form_items SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'check_form_items', targetId: rows[0].id,
    description: `Updated check form item "${rows[0].description}"`,
  });
  res.json(rowToCamel(rows[0]));
});

// Unlike competency types, an item's answers live in the check's own
// details JSONB keyed by item id, not a foreign key - deleting an item
// just leaves that key unreadable on any already-completed check, it
// doesn't touch or cascade-delete historical records.
router.delete('/:id', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { rows } = await pool.query('DELETE FROM check_form_items WHERE id = $1 RETURNING description', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'DELETE', targetTable: 'check_form_items', targetId: req.params.id,
    description: `Deleted check form item "${rows[0].description}"`,
  });
  res.status(204).end();
});

module.exports = router;
