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
// only they should be setting. aircraft_type is a free-text label, not a
// fixed enum - Fokker 100/Dash 8/Metro are the three the "Autofill FSTD"
// button on the IPC/PC check form actually matches against (it compares
// against the check's own aircraft type field), but an operator can add
// further presets under any label they choose (e.g. a second simulator for
// the same type at a different training centre) - those just won't
// autofill unless something else matches that exact label.

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
  const aircraftType = (req.params.aircraftType || '').trim();
  if (!aircraftType || aircraftType.length > 60) {
    return res.status(400).json({ error: 'Aircraft type/label is required (max 60 characters)' });
  }

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

router.delete('/:aircraftType', async (req, res) => {
  const { aircraftType } = req.params;
  await pool.query('DELETE FROM fstd_presets WHERE aircraft_type = $1', [aircraftType]);
  await logAction({ userId: req.user.id, action: 'DELETE', targetTable: 'fstd_presets', targetId: aircraftType });
  res.json({ ok: true });
});

module.exports = router;
