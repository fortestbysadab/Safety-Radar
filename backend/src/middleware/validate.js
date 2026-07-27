/**
 * middleware/validate.js
 * ----------------------
 * - AppError: a typed error that the central error handler turns into an
 *   HTTP response with { error: { code, message, details } }.
 * - validate(schema): an Express middleware factory that runs a zod schema
 *   against req.body / req.query / req.params and collects all errors.
 * - errorHandler / notFound: standard Express error plumbing.
 */

export class AppError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = 'AppError';
  }
}

/**
 * Returns an Express middleware that validates req with the given zod schema.
 * Pass `{ body, query, params }` — each key is optional.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        const parsed = schemas.body.parse(req.body);
        req.body = parsed;
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        req.query = parsed;
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        req.params = parsed;
      }
      next();
    } catch (err) {
      if (err?.name === 'ZodError') {
        const details = err.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        }));
        return next(new AppError(400, 'Validation failed', { fields: details }));
      }
      next(err);
    }
  };
}

// 404 handler — mount after all routes
export function notFound(_req, _res, next) {
  next(new AppError(404, 'Not found'));
}

// Central error handler — mounted last
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  const status = err.status ?? 500;
  const payload = {
    error: {
      code: err.details?.code ?? (status === 500 ? 'INTERNAL_ERROR' : 'ERROR'),
      message: err.message ?? 'Internal server error',
    },
  };
  if (err.details) payload.error.details = err.details;

  if (status === 500) {
    // eslint-disable-next-line no-console
    console.error('[api] unhandled error:', err);
  }
  res.status(status).json(payload);
}
