// Every error ends up here, last, and becomes one uniform response:  { "error": "message" }
// Thanks to Express 5, errors thrown in async routes also arrive here automatically.
const { AppError } = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

function createErrorHandler({ logger = console } = {}) {
  // Express recognizes an error handler by its 4 parameters; "next" must not be removed.
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, req, res, next) {
    if (res.headersSent) {
      return next(err);
    }

    if (err instanceof AppError) {
      const body = { error: err.message };
      if (err.details !== undefined) body.details = err.details;
      return res.status(err.statusCode).json(body);
    }

    // Errors thrown by express.json()
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Request body is not valid JSON' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large' });
    }

    // Unexpected error: write the details only to the server log, never leak internals to the
    // client.
    logger.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  };
}

module.exports = { notFound, createErrorHandler };
