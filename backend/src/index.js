/**
 * index.js — Community Safety Platform API entry point
 * ----------------------------------------------------
 * Wires Express, middleware, routes, and error handling. Designed to run on
 * Render's Node 18+ runtime with minimal overhead.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { notFound, errorHandler } from './middleware/validate.js';

import healthRouter from './routes/health.js';
import reportsRouter from './routes/reports.js';
import votesRouter from './routes/votes.js';

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.set('trust proxy', 1); // Render runs behind a proxy; needed for rate-limit IP keys
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);
app.use(express.json({ limit: '16kb' })); // small payloads only — reports are tiny
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (m) => logger.info(m.trim()) },
}));

// Loose global limiter (authenticated users still share a higher per-key limit
// via the strict submission limiter on write endpoints).
app.use('/api/', generalLimiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use(healthRouter);
app.use(reportsRouter);
app.use(votesRouter);

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'Community Safety Intelligence Platform API',
    version: '0.1.0',
    endpoints: [
      'GET  /health',
      'GET  /health/ready',
      'GET  /api/hazards?lat=&lng=&radius=',
      'GET  /api/hazards/heatmap?lat=&lng=&radius=',
      'POST /api/reports',
      'POST /api/reports/:id/vote',
      'POST /api/reports/:id/clear',
    ],
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const port = env.PORT;
app.listen(port, () => {
  logger.info(`Community Safety API listening on :${port}`, { env: env.NODE_ENV });
});

export default app;
