/**
 * utils/crypto.js
 * ---------------
 * Anonymization hashing. A Google OAuth user ID (`sub`) is HMAC-SHA256 hashed
 * with a server-only secret. The resulting 64-hex digest is the only user
 * identifier that ever touches the database.
 *
 * Why HMAC (not plain SHA-256)? So that an attacker who steals the database
 * cannot brute-force Google `sub` IDs — they would also need HMAC_SECRET.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Compute the anonymous user hash for a given Google `sub` claim.
 * @param {string} googleSubId  Google stable user ID from the verified JWT.
 * @returns {string} 64-char lowercase hex SHA-256 HMAC digest.
 */
export function hashUserId(googleSubId) {
  if (!googleSubId || typeof googleSubId !== 'string') {
    throw new Error('hashUserId: googleSubId must be a non-empty string');
  }
  return createHmac('sha256', env.HMAC_SECRET)
    .update(googleSubId)
    .digest('hex');
}

/**
 * Constant-time comparison (defensive helper — used e.g. when matching hashes
 * in tests or webhook payloads).
 */
export function compareHashes(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
