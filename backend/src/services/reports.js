/**
 * services/reports.js
 * -------------------
 * Pure data-access / business logic for safety reports. Kept free of HTTP
 * concerns so it's easy to unit-test and reuse from websockets/cron jobs.
 */
import { pool } from '../config/db.js';
import { haversineDistance, isValidLatLng } from './geo.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/validate.js';

const VALID_CATEGORIES = new Set([
  'FOLLOWING',
  'HARASSMENT',
  'POOR_LIGHTING',
  'DESERTED_AREA',
  'UNSAFE_TRANSIT',
]);

/**
 * Create a new safety report after applying:
 *   - category validation
 *   - GPS geofence check (device location vs pin location ≤ N meters)
 *   - rate limit check (max N reports per userHash in window)
 *
 * @param {object} args
 * @param {string} args.userHash
 * @param {string} args.category
 * @param {string} [args.description]  — already sanitized by the route
 * @param {{lat:number,lng:number}} args.pinLocation
 * @param {{lat:number,lng:number}} args.deviceLocation
 */
export async function createReport({ userHash, category, description, pinLocation, deviceLocation }) {
  if (!VALID_CATEGORIES.has(category)) {
    throw new AppError(400, `Invalid category. Allowed: ${[...VALID_CATEGORIES].join(', ')}`);
  }
  if (!isValidLatLng(pinLocation)) throw new AppError(400, 'Invalid pin location');
  if (!isValidLatLng(deviceLocation)) throw new AppError(400, 'Invalid device location');

  // Geofence: pin must be within the configured max meters of the device GPS.
  const dist = haversineDistance(deviceLocation, pinLocation);
  if (dist > env.GEOFENCE_MAX_METERS) {
    throw new AppError(
      400,
      `Reported location is too far from your device GPS (${Math.round(dist)}m > ${env.GEOFENCE_MAX_METERS}m). Please move closer or refresh your location.`,
      { code: 'GEOFENCE_VIOLATION', distance: Math.round(dist) }
    );
  }

  // Rate limit check: count reports from this userHash in the window.
  const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  const since = new Date(Date.now() - windowMs);
  const { rows: existing } = await pool.query(
    `SELECT COUNT(*)::int AS n
       FROM public.safety_reports
      WHERE anon_user_hash = $1 AND created_at > $2`,
    [userHash, since]
  );
  if (existing[0].n >= env.RATE_LIMIT_MAX) {
    throw new AppError(429, `Too many reports — limit is ${env.RATE_LIMIT_MAX} per ${env.RATE_LIMIT_WINDOW_MINUTES} minutes.`, {
      code: 'RATE_LIMITED',
      retryAfter: env.RATE_LIMIT_WINDOW_MINUTES * 60,
    });
  }

  // Insert. expires_at is auto-set by the database trigger (trg_safety_reports_set_expires).
  const { rows } = await pool.query(
    `INSERT INTO public.safety_reports
        (anon_user_hash, category, description, location)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography)
     RETURNING id, category, description, status, upvotes, downvotes,
               created_at, expires_at,
               ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng`,
    [userHash, category, description ?? null, pinLocation.lng, pinLocation.lat]
  );

  return rows[0];
}

/** Fetch active hazards within radius (meters) using the DB function. */
export async function getActiveHazards({ lat, lng, radius = 2000 }) {
  if (!isValidLatLng({ lat, lng })) throw new AppError(400, 'Invalid lat/lng');
  const r = Math.max(50, Math.min(10000, Number(radius) || 2000));

  const { rows } = await pool.query(
    `SELECT * FROM public.get_active_hazards($1, $2, $3)`,
    [lat, lng, r]
  );
  return rows;
}
