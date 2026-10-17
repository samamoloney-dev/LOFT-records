const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    // The roster-wide views (Crew list, Home dashboard) run ~25 small
    // queries per person in parallel; the default 10 connections made them
    // queue (7-8 seconds for 62 people).
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX) || 20 });
  }
  return pool;
}

module.exports = {
  query: (...args) => getPool().query(...args),
  connect: () => getPool().connect(),
  end: () => (pool ? pool.end() : Promise.resolve()),
};
