const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');
const { rowToCamel, parsePgArray } = require('../../db/serialize');

const JWT_SECRET = process.env.JWT_SECRET;

function issueToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '12h' });
}

// Bearer token in the Authorization header, not a cookie. Frontend and
// backend live on two separate *.onrender.com hosts in deployment, which
// browsers treat as cross-site - the cookie this used to be was already
// correctly configured SameSite=None; Secure for that, but Safari's
// Intelligent Tracking Prevention still blocked it for real iPad users,
// since the backend host is only ever reached via background fetch calls,
// never a top-level page visit, and ITP treats that as third-party tracking
// regardless of the SameSite setting. A bearer token isn't a cookie at all,
// so none of that applies - the frontend sends it explicitly on every
// request instead of the browser deciding whether to attach it.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      `SELECT u.*, t.id AS trainee_id
       FROM users u
       LEFT JOIN trainees t ON t.user_id = u.id
       WHERE u.id = $1`,
      [payload.sub],
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Not authenticated' });

    const row = rowToCamel(rows[0]);
    req.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      fleets: parsePgArray(row.fleets),
      checkAccess: parsePgArray(row.checkAccess),
      trainee: row.traineeId ? { id: row.traineeId } : null,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

module.exports = { requireAuth, issueToken };
