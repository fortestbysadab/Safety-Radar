/**
 * config/env.js
 * -------------
 * Loads and validates all environment variables at boot-time. If any required
 * variable is missing or malformed, the process exits immediately with a clear
 * error rather than failing cryptically on first use.
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(10000),

  // Postgres — must have PostGIS enabled (Supabase/Neon)
  DATABASE_URL: z.string().url().startsWith('postgres', 'DATABASE_URL must be a postgres:// or postgresql:// URL'),

  // Supabase Auth — used to verify Google OAuth JWTs from clients
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Anonymization HMAC secret — MUST be long & random (≥32 bytes)
  HMAC_SECRET: z.string().min(16, 'HMAC_SECRET must be at least 16 characters; use a long random string'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Anti-abuse tuning (defaults match the spec)
  GEOFENCE_MAX_METERS: z.coerce.number().positive().default(100),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(3),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(30),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('[env] Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
