const express = require('express');
const { z } = require('zod');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');
const { requireAuth } = require('../middleware/auth');
const { requireRole, ADMIN_ROLES } = require('../middleware/roles');
const { logAction } = require('../lib/audit');

const router = express.Router();

// HOTC/HOFO/Flight Ops Admin only, per the operator's request - these are
// real operational facts (which FSTD, its number/type per aircraft) that
// only they should be setting.
const AIRCRAFT_TYPES = ['Fokker 100', 'Dash 8', 'Metro'];

router.use(requireAuth);
router.use(requireRole(...ADMIN_ROLES));

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM fstd_presets ORDER BY aircraft_type ASC');
  res.json(rows.map(rowToCamel));
});

const upsertSchema = z.object({
  fstdNumber: z.string().nullable().optional(),
  fstdType: z.string().nullable().optional(),
});

router.put('/:aircraftType', async (req, res) => {
  const { aircraftType } = req.params;
  if (!AIRCRAFT_TYPES.includes(aircraftType)) return res.status(400).json({ error: 'Unknown aircraft type' });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fstdNumber, fstdType } = parsed.data;

  const { rows } = await pool.query(
    `INSERT INTO fstd_presets (aircraft_type, fstd_number, fstd_type) VALUES ($1, $2, $3)
     ON CONFLICT (aircraft_type) DO UPDATE SET fstd_number = $2, fstd_type = $3, updated_at = now()
     RETURNING *`,
    [aircraftType, fstdNumber ?? null, fstdType ?? null],
  );
  await logAction({ userId: req.user.id, action: 'UPDATE', targetTable: 'fstd_presets', targetId: rows[0].id });
  res.json(rowToCamel(rows[0]));
});

module.exports = router;
