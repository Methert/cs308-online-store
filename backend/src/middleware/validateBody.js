// Checks the JSON body (req.body) against a zod schema.
// If it is invalid, the request never reaches the route: it returns 400 with a list of the
// problems per field.
// If it is valid, req.body is replaced by the cleaned version (spaces trimmed, unknown fields
// removed).
const { AppError } = require('../utils/AppError');

function validateBody(schema) {
  return function validate(req, res, next) {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        message: issue.message,
      }));
      return next(new AppError(400, 'Validation failed', details));
    }
    req.body = result.data;
    return next();
  };
}

module.exports = { validateBody };
