/**
 * middleware/rateLimit.js
 * -----------------------
 * Two rate limiters:
 *
 *   1. `strictSubmissionLimiter` — 3 submissions per 30 minutes per anonymous
 *      user hash. This is the spec's anti-spam guardrail (spec §7). Applied
 *      to POST /api/reports, /vote, /clear. Uses req.userHash as the key so
 *      unauthenticated requests can't submit at all.
 *
 *   2. `generalLimiter` — a looser IP-based limiter on the rest of the API to
 *      blunt unauthenticated DoS against read endpoints like GET /api/hazards.
 *
 * Key generator uses req.userHash when present (authenticated calls fall
 * through our HMAC key), otherwise it falls back to the trusted proxy IP.
 */
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from './validate.js';

/**
 * Helper: build a rate-limit middleware that keys on userHash when available,
 * else on IP. Throws an AppError(429) so our central error handler formats
 * the response consistently.
 */
function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,   // Return RateLimit-* headers
    legacyHeaders: false,
    keyGenerator: (req) => req.userHash ?? `ip:${req.ip}`,
    skipFailedRequests: false,
    handler: (_req, _res, _next, opts) => {
      // We throw instead of sending directly so errorHandler formats it.
      // express-rate-limit doesn't support async handlers, but throwing sync
      // works because Express catches sync throws in middleware.
      throw new AppError(429, message, {
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil(windowMs / 1000),
        limit: opts.max,
      });
    },
  });
}

/** 3 reports/votes per 30 minutes per anonymous user (spec §7). */
export const strictSubmissionLimiter = makeLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX,
  message: `Too many submissions — limit is ${env.RATE_LIMIT_MAX} per ${env.RATE_LIMIT_WINDOW_MINUTES} minutes.`,
});

/** Loose read-side limiter: 120 requests/min/key. */
export const generalLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Too many requests — please slow down.',
});
