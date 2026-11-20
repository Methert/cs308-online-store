// Rules for the product and category endpoints: query strings (?q=...&sort=...), URL ids and the
// JSON bodies the product manager sends.
//
// Create and update bodies use z.strictObject: an unknown field is an error instead of being
// dropped silently, so a typo such as "stockQuantiy" is reported to the frontend.
const { z } = require('zod');
const { AppError } = require('../utils/AppError');

// The values of the card_condition enum in prisma/schema.prisma, best to worst.
const CARD_CONDITIONS = Object.freeze(['mint', 'near_mint', 'excellent', 'good', 'played', 'poor']);

// Sort options of the product list. Requirement 7 asks for price and popularity.
const PRODUCT_SORTS = Object.freeze([
  'name_asc',
  'price_asc',
  'price_desc',
  'popularity',
  'newest',
]);
const DEFAULT_SORT = 'name_asc';

// Status filter of the product manager's list.
const PRODUCT_STATUSES = Object.freeze(['active', 'inactive', 'all']);

// PostgreSQL "integer" columns hold at most this value. A bigger id would make the database
// throw, so it is rejected here as a bad request instead of becoming a 500 error.
const MAX_DB_INT = 2147483647;

// Money columns are DECIMAL(10, 2): at most 8 digits before the point and 2 after it.
const MAX_MONEY = 99999999.99;
const MAX_STOCK = 1000000;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

// --- Small building blocks ---------------------------------------------------

function requiredText(label, max) {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);
}

// Optional text that may also be cleared with null. An empty string is stored as null.
function optionalText(label, max) {
  return z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

function hasAtMostTwoDecimals(value) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

function money(label) {
  return z
    .number({ error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(MAX_MONEY, `${label} is too large`)
    .refine(hasAtMostTwoDecimals, { error: `${label} can have at most 2 decimals` })
    .transform((value) => Math.round(value * 100) / 100);
}

const stockQuantity = z
  .number({ error: 'Stock quantity must be a number' })
  .int('Stock quantity must be a whole number')
  .min(0, 'Stock quantity cannot be negative')
  .max(MAX_STOCK, 'Stock quantity is too large');

const positiveId = (label) =>
  z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .positive(`${label} must be positive`)
    .max(MAX_DB_INT, `${label} is too large`);

// A card picture is either a path served by this API (/images/cards/...) or an http(s) address.
// Other schemes such as "javascript:" are refused so the frontend can safely use the value.
const imageUrl = z
  .string({ error: 'Image URL must be text' })
  .trim()
  .max(500, 'Image URL must be at most 500 characters')
  .refine(
    (value) =>
      value === '' || (value.startsWith('/') && !value.startsWith('//')) || isHttpUrl(value),
    { error: 'Image URL must start with / or be an http(s) address' },
  )
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Query strings arrive as text: "?page=2" gives "2". An empty value ("?q=") counts as missing.
function emptyToUndefined(value) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function queryInt(label, { min, max, fallback }) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string({ error: `${label} must be a single whole number` })
      .regex(/^\d+$/, `${label} must be a whole number`)
      .transform(Number)
      .pipe(
        z
          .number()
          .min(min, `${label} must be at least ${min}`)
          .max(max, `${label} must be at most ${max}`),
      )
      .optional()
      .default(fallback),
  );
}

// --- Query strings -----------------------------------------------------------

const searchText = z.preprocess(
  emptyToUndefined,
  z
    .string({ error: 'Search text must be a single value' })
    .trim()
    .max(100, 'Search text must be at most 100 characters')
    .optional(),
);

const sortOption = z.preprocess(
  emptyToUndefined,
  z
    .enum(PRODUCT_SORTS, { error: `Sort must be one of: ${PRODUCT_SORTS.join(', ')}` })
    .optional()
    .default(DEFAULT_SORT),
);

const categoryFilter = z.preprocess(
  emptyToUndefined,
  z
    .string({ error: 'Category id must be a single whole number' })
    .regex(/^\d+$/, 'Category id must be a whole number')
    .transform(Number)
    .pipe(positiveId('Category id'))
    .optional(),
);

const paging = {
  page: queryInt('Page', { min: 1, max: 100000, fallback: 1 }),
  limit: queryInt('Limit', { min: 1, max: MAX_PAGE_SIZE, fallback: DEFAULT_PAGE_SIZE }),
};

// GET /api/products
const productListQuerySchema = z.object({
  q: searchText,
  categoryId: categoryFilter,
  sort: sortOption,
  ...paging,
});

// GET /api/categories/:id/products (the category comes from the URL)
const categoryProductsQuerySchema = z.object({
  q: searchText,
  sort: sortOption,
  ...paging,
});

// GET /api/products/manage (product and sales managers also see removed products)
const managedProductListQuerySchema = productListQuerySchema.extend({
  status: z.preprocess(
    emptyToUndefined,
    z
      .enum(PRODUCT_STATUSES, { error: `Status must be one of: ${PRODUCT_STATUSES.join(', ')}` })
      .optional()
      .default('active'),
  ),
});

// --- Request bodies: products ------------------------------------------------

const productFields = {
  categoryId: positiveId('Category id'),
  name: requiredText('Name', 200),
  model: requiredText('Model', 100),
  serialNumber: requiredText('Serial number', 100),
  rarity: requiredText('Rarity', 100),
  condition: z.enum(CARD_CONDITIONS, {
    error: `Condition must be one of: ${CARD_CONDITIONS.join(', ')}`,
  }),
  description: requiredText('Description', 2000),
  price: money('Price'),
  // Empty cost means "half of the price" in profit calculations (requirement 11).
  cost: money('Cost').nullable().optional(),
  warrantyStatus: requiredText('Warranty status', 200),
  distributor: requiredText('Distributor', 200),
  imageUrl,
};

// POST /api/products
const createProductSchema = z.strictObject(
  {
    ...productFields,
    condition: productFields.condition.optional().default('near_mint'),
    stockQuantity: stockQuantity.optional().default(0),
  },
  { error: (issue) => unknownFieldMessage(issue, 'stock changes are not allowed here') },
);

// PATCH /api/products/:id. Every field is optional, at least one is required.
// Stock is changed through PATCH /api/products/:id/stock, so that a stock update can never
// overwrite a product edit (or the other way around).
const updateProductSchema = z
  .strictObject(
    {
      categoryId: productFields.categoryId.optional(),
      name: productFields.name.optional(),
      model: productFields.model.optional(),
      serialNumber: productFields.serialNumber.optional(),
      rarity: productFields.rarity.optional(),
      condition: productFields.condition.optional(),
      description: productFields.description.optional(),
      price: productFields.price.optional(),
      cost: productFields.cost,
      warrantyStatus: productFields.warrantyStatus.optional(),
      distributor: productFields.distributor.optional(),
      imageUrl,
      // true puts a removed product back on sale.
      isActive: z.boolean({ error: 'isActive must be true or false' }).optional(),
    },
    {
      error: (issue) =>
        unknownFieldMessage(issue, 'use PATCH /api/products/:id/stock to change the stock'),
    },
  )
  .refine((body) => Object.keys(body).length > 0, {
    error: 'Send at least one field to update',
  });

// PATCH /api/products/:id/stock
//   { "stockQuantity": 10 }  sets the stock to 10 (for example after counting the shelf)
//   { "change": 5 }          adds 5 copies; { "change": -2 } removes 2 copies
// "change" is applied by the database in one step, so it is safe while customers are buying.
const updateStockSchema = z
  .strictObject(
    {
      stockQuantity: stockQuantity.optional(),
      change: z
        .number({ error: 'Change must be a number' })
        .int('Change must be a whole number')
        .min(-MAX_STOCK, 'Change is too large')
        .max(MAX_STOCK, 'Change is too large')
        .refine((value) => value !== 0, { error: 'Change cannot be 0' })
        .optional(),
    },
    { error: (issue) => unknownFieldMessage(issue) },
  )
  .refine((body) => (body.stockQuantity === undefined) !== (body.change === undefined), {
    error: 'Send exactly one of stockQuantity or change',
  });

// --- Request bodies: categories ----------------------------------------------

const releaseDate = z
  .string({ error: 'Release date must be text in YYYY-MM-DD form' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Release date must be in YYYY-MM-DD form')
  .refine(isRealDate, { error: 'Release date is not a real date' })
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .nullable()
  .optional();

function isRealDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const categoryFields = {
  name: requiredText('Name', 100),
  description: optionalText('Description', 1000),
  setCode: optionalText('Set code', 50),
  series: optionalText('Series', 100),
  releaseDate,
};

// POST /api/categories
const createCategorySchema = z.strictObject(categoryFields, {
  error: (issue) => unknownFieldMessage(issue),
});

// PATCH /api/categories/:id
const updateCategorySchema = z
  .strictObject(
    { ...categoryFields, name: categoryFields.name.optional() },
    { error: (issue) => unknownFieldMessage(issue) },
  )
  .refine((body) => Object.keys(body).length > 0, {
    error: 'Send at least one field to update',
  });

function unknownFieldMessage(issue, hint) {
  if (issue.code !== 'unrecognized_keys') return undefined;
  const fields = issue.keys.join(', ');
  return hint && issue.keys.includes('stockQuantity')
    ? `Unknown field: ${fields} (${hint})`
    : `Unknown field: ${fields}`;
}

// --- URL ids -----------------------------------------------------------------

// Turns the ":id" of a URL into a number. "abc", "1.5", "-3", "0" and ids larger than the
// database can hold give a 400 error instead of reaching the database.
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

module.exports = {
  CARD_CONDITIONS,
  PRODUCT_SORTS,
  PRODUCT_STATUSES,
  DEFAULT_SORT,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_DB_INT,
  productListQuerySchema,
  categoryProductsQuerySchema,
  managedProductListQuerySchema,
  createProductSchema,
  updateProductSchema,
  updateStockSchema,
  createCategorySchema,
  updateCategorySchema,
  parseId,
};
