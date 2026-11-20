// Checks the query string (?q=...&page=2) against a zod schema, like validateBody does for the
// JSON body. Invalid values give 400 with a list of problems per field.
//
// In Express 5 req.query is read-only, so the cleaned values (numbers, defaults filled in) are
// stored in req.validatedQuery. Routes read req.validatedQuery, never req.query.
const { AppError } = require('../utils/AppError');

function validateQuery(schema) {
  return function validate(req, res, next) {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(query)',
        message: issue.message,
      }));
      return next(new AppError(400, 'Invalid query parameters', details));
    }
    req.validatedQuery = result.data;
    return next();
  };
}

module.exports = { validateQuery };
