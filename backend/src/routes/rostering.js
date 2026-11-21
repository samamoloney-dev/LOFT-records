const crypto = require('crypto');
const express = require('express');
const { listCrewWithCurrency } = require('./crew');
const { competencyExportItems } = require('./users');
const { courseCodeMap } = require('./course-codes');

const router = express.Router();

// Read-only feed of every crew member's competency/recency dates for the
// rostering software. Flight Standards stays the system of record - this only
// ever hands dates out, it never accepts anything back.
//
// Not a user login: the rostering system sends a long random key (set in
// Render as ROSTERING_API_KEY; several can be listed comma-separated while a
// key is being replaced) in the X-API-Key header, or as "Authorization: Bearer
// <key>". With no key configured the endpoint is switched off entirely. The key
// only opens this one read-only endpoint - nothing else in the app.
const MIN_KEY_LENGTH = 32;

function configuredKeys() {
  return String(process.env.ROSTERING_API_KEY || process.env.ROSTERING_API_KEYS || '')
    .split(',').map((k) => k.trim()).filter((k) => k.length >= MIN_KEY_LENGTH);
}

function sha(value) { return crypto.createHash('sha256').update(value).digest(); }

function keyFromRequest(req) {
  const header = req.get('x-api-key');
  if (header) return header.trim();
  const auth = req.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function requireApiKey(req, res, next) {
  const keys = configuredKeys();
  if (keys.length === 0) return res.status(503).json({ error: 'The rostering API is not switched on' });
  const supplied = keyFromRequest(req);
  const suppliedHash = sha(supplied);
  // Compare against every configured key without stopping early.
  let ok = false;
  for (const key of keys) if (crypto.timingSafeEqual(suppliedHash, sha(key))) ok = true;
  if (!supplied || !ok) return res.status(401).json({ error: 'Invalid or missing API key' });
  next();
}

router.use(requireApiKey);

// Same fallback the CSV export uses for anything without a code set yet:
// letters only, upper-cased, padded to 7 characters. Flagged so the rostering
// side can tell a real code from a stand-in.
function codeFor(label, codeMap) {
  if (codeMap[label]) return { code: codeMap[label], codeIsSet: true };
  const letters = String(label || '').toUpperCase().replace(/[^A-Z]/g, '');
  return { code: (letters + 'XXXXXXX').slice(0, 7), codeIsSet: false };
}

// ISO calendar date (YYYY-MM-DD) exactly as the CSV export writes it.
function isoDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

// A once-off item (Life Jacket Training: "once completed it is not required to
// be done again") is held internally with a due date 100 years out as a stand-in
// for "never expires". The rostering software gets a blank due date and
// noExpiry: true rather than a date in the 2120s.
function dueFields(value) {
  const iso = isoDate(value);
  if (iso && Number(iso.slice(0, 4)) > 2060) return { dueDate: null, noExpiry: true };
  return { dueDate: iso, noExpiry: false };
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/rostering/competencies
//   ?type=PILOT | CABIN_ATTENDANT   only that kind of crew
//   ?arn=123456                     only that person (pilots)
//   ?crewMemberId=<uuid>            only that person
//   ?format=csv                     CSV instead of JSON
router.get('/competencies', async (req, res) => {
  const { type, arn, crewMemberId, format } = req.query;
  if (type && !['PILOT', 'CABIN_ATTENDANT'].includes(type)) {
    return res.status(400).json({ error: 'type must be PILOT or CABIN_ATTENDANT' });
  }

  const [members, staffItems, codeMap] = await Promise.all([
    listCrewWithCurrency({ archived: false }),
    competencyExportItems(),
    courseCodeMap(),
  ]);

  const items = [];
  for (const m of members) {
    for (const item of m.exportItems || []) {
      items.push({
        crewMemberId: m.id,
        name: m.name,
        arn: m.arn || null,
        type: m.type,
        fleets: m.fleets || [],
        competency: item.name,
        ...codeFor(item.name, codeMap),
        completedDate: isoDate(item.completedDate),
        ...dueFields(item.dueDate),
        status: item.status,
        plannedDate: isoDate(item.plannedDate),
        reason: item.overdueReason || null,
      });
    }
  }
  // FS Staff competencies (Ground Instructor, Flight Standards Personnel
  // Competency Check) - held on the staff record, so no crew member id.
  for (const s of staffItems) {
    items.push({
      crewMemberId: null,
      name: s.name,
      arn: s.arn || null,
      type: s.crewType,
      fleets: s.fleets || [],
      competency: s.item,
      ...codeFor(s.item, codeMap),
      completedDate: isoDate(s.completedDate),
      ...dueFields(s.dueDate),
      status: s.status,
      plannedDate: null,
      reason: null,
    });
  }

  const filtered = items.filter((i) => (!type || i.type === type)
    && (!arn || i.arn === String(arn))
    && (!crewMemberId || i.crewMemberId === crewMemberId));

  console.log(`Rostering API: served ${filtered.length} rows`);

  if (format === 'csv') {
    const headers = ['crewMemberId', 'name', 'arn', 'type', 'fleets', 'competency', 'code', 'codeIsSet', 'completedDate', 'dueDate', 'noExpiry', 'status', 'plannedDate', 'reason'];
    const lines = [headers.join(',')];
    for (const i of filtered) {
      lines.push([i.crewMemberId, i.name, i.arn, i.type, i.fleets.join(' '), i.competency, i.code, i.codeIsSet, i.completedDate, i.dueDate, i.noExpiry, i.status, i.plannedDate, i.reason].map(csvCell).join(','));
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    return res.send(lines.join('\r\n'));
  }

  res.json({ generatedAt: new Date().toISOString(), count: filtered.length, items: filtered });
});

module.exports = router;
