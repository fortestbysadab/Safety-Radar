/**
 * routes/reports.js
 * -----------------
 * Public + authenticated hazard endpoints:
 *
 *   POST /api/reports             Create a hazard report (auth required)
 *   GET  /api/hazards             Fetch active hazards near a point
 *   GET  /api/hazards/heatmap     Aggregated [lat,lng,intensity] for leaflet.heat
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate, AppError } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { strictSubmissionLimiter } from '../middleware/rateLimit.js';
import { sanitizeText } from '../utils/sanitize.js';
import { createReport, getActiveHazards } from '../services/reports.js';
import { buildHeatmapClusters } from '../services/geo.js';

const router = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const COORD_SCHEMA = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const postReportSchema = {
  body: z.object({
    category: z.enum(['FOLLOWING', 'HARASSMENT', 'POOR_LIGHTING', 'DESERTED_AREA', 'UNSAFE_TRANSIT']),
    description: z.string().max(2000).optional(),
    pin: COORD_SCHEMA,
    deviceLocation: COORD_SCHEMA,
  }),
};

const getHazardsSchema = {
  query: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().int().min(50).max(10000).optional().default(2000),
  }),
};

// ---------------------------------------------------------------------------
// POST /api/reports
// ---------------------------------------------------------------------------
router.post(
  '/api/reports',
  requireAuth,
  strictSubmissionLimiter,
  validate(postReportSchema),
  async (req, res, next) => {
    try {
      const { category, description, pin, deviceLocation } = req.body;
      const report = await createReport({
        userHash: req.userHash,
        category,
        description: sanitizeText(description),
        pinLocation: pin,
        deviceLocation,
      });
      res.status(201).json({ ok: true, report });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/hazards   (auth optional — the map loads publicly)
// ---------------------------------------------------------------------------
router.get('/api/hazards', validate(getHazardsSchema), async (req, res, next) => {
  try {
    const { lat, lng, radius } = req.query;
    const hazards = await getActiveHazards({ lat, lng, radius });
    res.json({ ok: true, hazards });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/hazards/heatmap
// ---------------------------------------------------------------------------
router.get('/api/hazards/heatmap', validate(getHazardsSchema), async (req, res, next) => {
  try {
    const { lat, lng, radius } = req.query;
    // For the heatmap we pull a slightly wider radius so clusters near the
    // edge of the viewport still render smoothly.
    const hazards = await getActiveHazards({ lat, lng, radius: Math.min(radius * 1.2, 10000) });
    const points = buildHeatmapClusters(hazards);
    res.json({ ok: true, points });
  } catch (err) {
    next(err);
  }
});

// Explicit 405 for unsupported methods on these endpoints
router.all('/api/reports', (_req, _res, next) => next(new AppError(405, 'Method not allowed')));
router.all('/api/hazards', (_req, _res, next) => next(new AppError(405, 'Method not allowed')));
router.all('/api/hazards/heatmap', (_req, _res, next) => next(new AppError(405, 'Method not allowed')));

export default router;
