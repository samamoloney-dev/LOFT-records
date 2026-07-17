const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES, isCaOnlyRole } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

router.use(requireAuth);

const FLEET_VALUES = ['DASH_8', 'FOKKER_100', 'METRO_23', 'CA_DASH_8', 'CA_FOKKER_100'];
const CA_FLEETS = ['CA_DASH_8', 'CA_FOKKER_100'];

function forbiddenFleetForCaManager(req, fleet) {
  return isCaOnlyRole(req.user) && fleet && !CA_FLEETS.includes(fleet);
}

// Named alternate syllabi (e.g. "Direct Entry Captain" on the Metro) - a
// separate Ground School/LOFT Package/Check Forms/Competencies set for a
// specific entry pathway, distinct from the fleet's standard one (which
// has no row here at all - every existing item/trainee/crew member with a
// NULL syllabus_id is implicitly "Standard", see check-form-items.js/
// ground-school.js/syllabus.js/competency-types.js). Open to any
// authenticated user - just names, no sensitive content, and every
// trainee/crew-creation form needs this list to offer the picker.
router.get('/', async (req, res) => {
  const { fleet } = req.query;
  if (fleet && !FLEET_VALUES.includes(fleet)) return res.status(400).json({ error: 'Unknown fleet' });
  const conditions = [];
  const params = [];
  if (fleet) { params.push(fleet); conditions.push(`fleet = $${params.length}`); }
  if (req.query.includeArchived !== 'true') conditions.push('archived = false');
  const { rows } = await pool.query(
    `SELECT * FROM training_syllabi ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY fleet ASC, name ASC`,
    params,
  );
  res.json(rows.map(rowToCamel));
});

const createSchema = z.object({
  name: z.string().min(1),
  fleet: z.enum(FLEET_VALUES),
});

router.post('/', requireRole(...ADMIN_ROLES, 'CA_MANAGER'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (forbiddenFleetForCaManager(req, parsed.data.fleet)) {
    return res.status(403).json({ error: 'Cabin Attendant Manager can only create cabin attendant syllabi' });
  }

  const { rows } = await pool.query(
    'INSERT INTO training_syllabi (name, fleet) VALUES ($1, $2) RETURNING *',
    [parsed.data.name, parsed.data.fleet],
  );
  const syllabus = rowToCamel(rows[0]);
  await logAction({
    userId: req.user.id, action: 'CREATE', targetTable: 'training_syllabi', targetId: syllabus.id,
    description: `Created syllabus "${syllabus.name}"`,
  });
  res.status(201).json(syllabus);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  archived: z.boolean().optional(),
});

router.patch('/:id', requireRole(...ADMIN_ROLES, 'CA_MANAGER'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const entries = Object.entries(parsed.data);
  if (entries.length === 0) return res.status(400).json({ error: 'No fields to update' });

  const { rows: existingRows } = await pool.query('SELECT * FROM training_syllabi WHERE id = $1', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Not found' });
  const existing = rowToCamel(existingRows[0]);
  if (forbiddenFleetForCaManager(req, existing.fleet)) {
    return res.status(403).json({ error: 'Cabin Attendant Manager can only edit cabin attendant syllabi' });
  }

  const setClauses = entries.map(([key], i) => `${key === 'archived' ? 'archived' : 'name'} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE training_syllabi SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values,
  );
  const syllabus = rowToCamel(rows[0]);
  await logAction({
    userId: req.user.id, action: 'UPDATE', targetTable: 'training_syllabi', targetId: syllabus.id,
    description: `Updated syllabus "${syllabus.name}"`,
  });
  res.json(syllabus);
});

module.exports = router;
