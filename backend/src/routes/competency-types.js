const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];

// node-postgres doesn't decode arrays of custom enum types (fleet[]) on
// its own - see db/serialize.js's parsePgArray - so fleets needs parsing
// on every response, not just rowToCamel's key-casing.
function serialize(row) {
  const t = rowToCamel(row);
  return { ...t, fleets: parsePgArray(t.fleets) };
}

// Admin-managed catalog of competency types (Dangerous Goods, First Aid,
// etc.) - see 0037_competency_types.sql. Every active type applies to
// every crew member automatically (see crew.js GET /:id/competencies),
// so managing this list is the only "add a competency" step there is -
// no per-crew-member dropdown any more, just a shared, extensible list.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const { rows } = await pool.query(
    `SELECT * FROM competency_types ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY sort_order ASC, created_at ASC`,
  );
  res.json(rows.map(serialize));
});

const createSchema = z.object({
  name: z.string().min(1),
  // Most competencies apply to every crew member (null) - scoping to one
  // type is the exception (e.g. Medical, pilot-only).
  appliesTo: z.enum(['PILOT', 'CABIN_ATTENDANT']).nullable().optional(),
  // Scoping to specific fleets is rarer still (e.g. an Emergency Slide
  // course that's Fokker 100 only) - null applies to every fleet, same as
  // appliesTo being null applies to every trainee type. Both can combine
  // (e.g. Fokker 100 AND pilot-only).
  fleets: z.array(z.enum(FLEET_VALUES)).nullable().optional(),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM competency_types');
  try {
    const { rows } = await pool.query(
      'INSERT INTO competency_types (name, sort_order, applies_to, fleets) VALUES ($1, $2, $3, $4::fleet[]) RETURNING *',
      [parsed.data.name, maxRows[0].next, parsed.data.appliesTo || null, parsed.data.fleets?.length ? parsed.data.fleets : null],
    );
    await logAction({
      userId: req.user.id, action: 'CREATE', targetTable: 'competency_types', targetId: rows[0].id,
      description: `Added competency type "${rows[0].name}"`,
    });
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A competency with that name already exists' });
    throw err;
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  archived: z.boolean().optional(),
  appliesTo: z.enum(['PILOT', 'CABIN_ATTENDANT']).nullable().optional(),
  fleets: z.array(z.enum(FLEET_VALUES)).nullable().optional(),
});
const COLUMN_MAP = { name: 'name', archived: 'archived', appliesTo: 'applies_to', fleets: 'fleets' };
const CAST_MAP = { fleets: '::fleet[]' };

router.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}${CAST_MAP[key] || ''}`);
  const values = entries.map(([key, value]) => (key === 'fleets' && Array.isArray(value) && value.length === 0 ? null : value));
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE competency_types SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'competency_types', targetId: rows[0].id,
    description: `Updated competency type "${rows[0].name}"`,
  });
  res.json(serialize(rows[0]));
});

// A hard delete cascades to every crew member's crew_competencies row for
// this type (see 0038_crew_competencies_type_link.sql) - unlike archiving,
// their dates are gone too, not just hidden. The frontend warns about this
// before calling it; archive is the safe default for a type still in use.
router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query('DELETE FROM competency_types WHERE id = $1 RETURNING name', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  await logAction({
    userId: req.user.id, action: 'DELETE', targetTable: 'competency_types', targetId: req.params.id,
    description: `Deleted competency type "${rows[0].name}"`,
  });
  res.status(204).end();
});

module.exports = router;
