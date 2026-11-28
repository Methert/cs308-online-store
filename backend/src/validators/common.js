// Small rules shared by the product, category and delivery routes.
const { z } = require('zod');
const { AppError } = require('../utils/AppError');

// PostgreSQL "integer" columns hold at most this value. A bigger id makes the database throw,
// so we stop it here and answer 400 instead of 500.
const MAX_DB_INT = 2147483647;

// Turns the ":id" of a URL into a number.
// "abc", "1.5", "1e3", "-3", "0" and too large ids all give 400.
function parseId(value, label = 'Id') {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new AppError(400, `${label} must be a positive whole number`);
  }
  const id = Number(value);
  if (id < 1 || id > MAX_DB_INT) {
    throw new AppError(400, `${label} must be a positive whole number`);
  }
  return id;
}

// Query string page numbers: "?page=2&limit=20". Missing or empty means the default.
function pageField(label, max, fallback) {
  return z.preprocess(
    (value) => (value === undefined || value === '' ? String(fallback) : value),
    z
      .string({ error: `${label} must be a single whole number` })
      .regex(/^\d+$/, `${label} must be a whole number`)
      .transform(Number)
      .pipe(
        z
          .number()
          .min(1, `${label} must be at least 1`)
          .max(max, `${label} must be at most ${max}`),
      ),
  );
}

module.exports = { MAX_DB_INT, parseId, pageField };
