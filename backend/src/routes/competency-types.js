const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
// Further scopes a Pilots-only competency to pilots who are also linked to
// a staff account holding one of these specific roles (see
// 0077_competency_type_staff_roles.sql) - null/empty applies to every
// pilot, same as today.
const STAFF_ROLE_VALUES = ['EXAMINER', 'CC', 'TRAINING_CAPTAIN'];

// node-postgres doesn't decode arrays of custom enum types (fleet[]) on
// its own - see db/serialize.js's parsePgArray - so fleets needs parsing
// on every response, not just rowToCamel's key-casing.
function serialize(row) {
  const t = rowToCamel(row);
  return { ...t, fleets: parsePgArray(t.fleets), staffRoles: parsePgArray(t.staffRoles) };
}

// Admin-managed catalog of competency types (Dangerous Goods, First Aid,
// etc.) - see 0037_competency_types.sql. Every active type applies to
// every crew member automatically (see crew.js GET /:id/competencies),
// so managing this list is the only "add a competency" step there is -
// no per-crew-member dropdown any more, just a shared, extensible list.
router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

// syllabusId scopes the list to one named syllabus's own Competencies
// bucket (see syllabi.js) - omitted/empty means the fleet's standard
// bucket (syllabus_id IS NULL). Always required in practice (the frontend
// always sends it, even as empty) since these types have no fleet column
// of their own to scope by otherwise.
router.get('/', async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const conditions = ['syllabus_id IS NOT DISTINCT FROM $1'];
  if (!includeArchived) conditions.push('archived = false');
  const { rows } = await pool.query(
    `SELECT * FROM competency_types WHERE ${conditions.join(' AND ')} ORDER BY sort_order ASC, created_at ASC`,
    [req.query.syllabusId || null],
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
  // Narrower still, and only meaningful alongside appliesTo: 'PILOT' - only
  // pilots also linked to a staff account holding one of these roles.
  staffRoles: z.array(z.enum(STAFF_ROLE_VALUES)).nullable().optional(),
  syllabusId: z.string().uuid().nullable().optional(),
});

router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { rows: maxRows } = await pool.query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM competency_types');
  try {
    const { rows } = await pool.query(
      'INSERT INTO competency_types (name, sort_order, applies_to, fleets, staff_roles, syllabus_id) VALUES ($1, $2, $3, $4::fleet[], $5::user_role[], $6) RETURNING *',
      [
        parsed.data.name, maxRows[0].next, parsed.data.appliesTo || null,
        parsed.data.fleets?.length ? parsed.data.fleets : null,
        parsed.data.staffRoles?.length ? parsed.data.staffRoles : null,
        parsed.data.syllabusId || null,
      ],
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
  staffRoles: z.array(z.enum(STAFF_ROLE_VALUES)).nullable().optional(),
  syllabusId: z.string().uuid().nullable().optional(),
});
const COLUMN_MAP = { name: 'name', archived: 'archived', appliesTo: 'applies_to', fleets: 'fleets', staffRoles: 'staff_roles', syllabusId: 'syllabus_id' };
const CAST_MAP = { fleets: '::fleet[]', staffRoles: '::user_role[]' };

router.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const setClauses = entries.map(([key], i) => `${COLUMN_MAP[key]} = $${i + 1}${CAST_MAP[key] || ''}`);
  const values = entries.map(([key, value]) => ((key === 'fleets' || key === 'staffRoles') && Array.isArray(value) && value.length === 0 ? null : value));
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
