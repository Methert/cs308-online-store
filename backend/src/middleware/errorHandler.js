// Every error ends up here, last, and becomes one uniform response:  { "error": "message" }
// Thanks to Express 5, errors thrown in async routes also arrive here automatically.
const { AppError } = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// PostgreSQL error 22003 = "numeric value out of range". Prisma reports it as P2020, or as
// P2010 when the query was written with $executeRaw / $queryRaw.
function isValueOutOfRange(err) {
  if (!err) return false;
  if (err.code === 'P2020') return true;
  const cause = err.meta?.driverAdapterError?.cause;
  return cause?.originalCode === '22003';
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
    // Other client errors from Express itself (for example an unsupported charset). They are
    // marked "expose" when their message is safe to show.
    if (err && err.expose === true && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }

    // Safety nets for database errors caused by bad input. Each route should check its input
    // itself, but if one misses a case the client still gets a 4xx instead of a 500.
    //
    // "Record to update/delete was not found"
    if (err && err.code === 'P2025') {
      return res.status(404).json({ error: 'Not found' });
    }
    // A number too large for the column, for example /api/orders/99999999999
    if (isValueOutOfRange(err)) {
      return res.status(400).json({ error: 'A number in the request is too large' });
    }
    // A value of the wrong type reached a query, for example "abc" where an id was expected.
    // It is still logged, because it means a route forgot to validate something.
    if (err && err.name === 'PrismaClientValidationError') {
      const warn = logger.warn ?? logger.error;
      warn(`Unvalidated input reached the database: ${req.method} ${req.originalUrl}`);
      return res.status(400).json({ error: 'Invalid value in the request' });
    }

    // Unexpected error: write the details only to the server log, never leak internals to the
    // client.
    logger.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  };
}

module.exports = { notFound, createErrorHandler };
