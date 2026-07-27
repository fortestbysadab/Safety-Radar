/**
 * routes/votes.js
 * ---------------
 * Community verification endpoints:
 *
 *   POST /api/reports/:id/vote   { voteType: 'up' | 'down' }
 *   POST /api/reports/:id/clear  (shortcut: casts a 'down' + auto-expires at threshold)
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { strictSubmissionLimiter } from '../middleware/rateLimit.js';
import { castVote, clearReport } from '../services/votes.js';

const router = Router();

const voteBody = {
  body: z.object({
    voteType: z.enum(['up', 'down']),
  }),
};

const paramsId = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

router.post(
  '/api/reports/:id/vote',
  requireAuth,
  strictSubmissionLimiter,
  validate({ ...paramsId, ...voteBody }),
  async (req, res, next) => {
    try {
      const updated = await castVote({
        reportId: req.params.id,
        userHash: req.userHash,
        voteType: req.body.voteType,
      });
      res.json({ ok: true, report: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/api/reports/:id/clear',
  requireAuth,
  strictSubmissionLimiter,
  validate(paramsId),
  async (req, res, next) => {
    try {
      const updated = await clearReport({
        reportId: req.params.id,
        userHash: req.userHash,
      });
      res.json({ ok: true, report: updated, cleared: updated.status === 'cleared' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
