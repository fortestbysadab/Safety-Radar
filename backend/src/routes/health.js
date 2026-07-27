/**
 * routes/health.js
 * ----------------
 * Liveness/readiness probes used by Render and local dev.
 */
import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'community-safety-api', ts: new Date().toISOString() });
});

router.get('/health/ready', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: 'connected' });
  } catch (err) {
    next(err);
  }
});

export default router;
