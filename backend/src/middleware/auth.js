const jwt = require('jsonwebtoken');
const pool = require('../../db/pool');
const { rowToCamel } = require('../../db/serialize');

const COOKIE_NAME = 'loft_session';
const JWT_SECRET = process.env.JWT_SECRET;

function issueToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '12h' });
}

// Frontend and backend live on different subdomains in deployment (e.g. two
// separate *.onrender.com hosts), which browsers treat as cross-site. Cross-site
// fetch/XHR only sends cookies marked SameSite=None; Secure - Lax would silently
// drop the cookie on every request after login. Secure cookies require HTTPS
// though, which local dev/tests don't have, so this only applies in production.
const COOKIE_OPTIONS = process.env.NODE_ENV === 'production'
  ? { httpOnly: true, sameSite: 'none', secure: true }
  : { httpOnly: true, sameSite: 'lax', secure: false };

function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, issueToken(user), {
    ...COOKIE_OPTIONS,
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
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
      fleetAccess: row.fleetAccess,
      trainee: row.traineeId ? { id: row.traineeId } : null,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
}

module.exports = { requireAuth, issueToken, setSessionCookie, clearSessionCookie, COOKIE_NAME };
