/**
 * config/db.js
 * ------------
 * PostgreSQL connection pool. Uses `pg` (node-postgres) directly against the
 * Supabase/Neon DATABASE_URL. The pool handles connect/disconnect + SSL is
 * required by Supabase (pg negotiates that automatically on Supabase URLs but
 * we set ssl.rejectUnauthorized explicitly for Neon/local cert pairs).
 */
import pg from 'pg';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Supabase uses SSL; keep this on. For local dev against a plain Postgres
  // container (no SSL), set DATABASE_SSL=false in .env.
  ssl:
    process.env.DATABASE_SSL === 'false'
      ? false
      : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  logger.error('Unexpected Postgres pool error', { error: err.message });
});

// Quick self-test on boot
pool.query('SELECT 1 AS ok')
  .then(() => logger.info('Database connection established'))
  .catch((err) => {
    logger.error('Database connection failed on boot', { error: err.message });
    // We don't exit here so the server can still respond to /health; the first
    // real DB call will surface the error in context.
  });

/** Helper for one-off queries in a route. */
export async function query(text, params) {
  return pool.query(text, params);
}
