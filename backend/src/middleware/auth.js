/**
 * middleware/auth.js
 * ------------------
 * Verifies the client's Google OAuth JWT with Supabase Auth, then maps the
 * Google `sub` claim to the anonymous HMAC hash that the rest of the app uses
 * as the user identity.
 *
 * Flow:
 *   1. Client sends `Authorization: Bearer <supabase-session-jwt>`.
 *   2. We call supabase.auth.getUser(jwt) — Supabase verifies signature/expiry.
 *   3. The returned user has identities[] — we take the Google identity's
 *      `id` (which is Google's `sub`). We also accept the user's top-level
 *      `id` (Supabase user id) as a fallback for password/OTP logins.
 *   4. We HMAC-SHA256 that identifier with HMAC_SECRET → anon_user_hash.
 *   5. `req.userHash` is set; downstream code never sees email/name.
 */
import { supabase } from '../config/supabase.js';
import { hashUserId } from '../utils/crypto.js';
import { AppError } from './validate.js';
import { logger } from '../utils/logger.js';

/**
 * Extract the Bearer token from the Authorization header.
 */
function extractToken(header) {
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

/**
 * Resolve the stable provider-independent identifier we hash: prefer Google's
 * `sub` (the Google user ID), fall back to the Supabase user id. This keeps
 * the hash stable across sessions for the same Google account.
 */
function resolveIdForHashing(user) {
  const googleIdentity = user.identities?.find((i) => i.provider === 'google');
  if (googleIdentity?.id) return `google:${googleIdentity.id}`;
  // Fallback: any other Supabase auth provider (e.g. magic link) — still hashed.
  return `supabase:${user.id}`;
}

/**
 * Express middleware. Populates `req.userHash`. Rejects unauthenticated
 * requests with 401.
 */
export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req.headers.authorization);
    if (!token) {
      return next(new AppError(401, 'Missing or malformed Authorization header. Expected: Bearer <token>.'));
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      logger.debug('auth: failed to verify JWT', { error: error?.message });
      return next(new AppError(401, 'Invalid or expired authentication token.'));
    }

    const rawId = resolveIdForHashing(data.user);
    req.userHash = hashUserId(rawId);
    req.user = { id: data.user.id /*, email intentionally omitted */ };
    next();
  } catch (err) {
    logger.error('auth middleware unexpected error', { error: err.message });
    next(new AppError(500, 'Authentication failed'));
  }
}
