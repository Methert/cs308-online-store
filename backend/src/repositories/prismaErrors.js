// Turns the Prisma errors that a user can cause into clear AppErrors.
// Anything else is returned unchanged and ends up as a 500 in the error handler.
const { AppError } = require('../utils/AppError');

// Prisma error codes: https://www.prisma.io/docs/orm/reference/error-reference
const UNIQUE_CONSTRAINT_FAILED = 'P2002';
const FOREIGN_KEY_FAILED = 'P2003';

// Readable names of the unique columns, for the 409 message.
const FIELD_LABELS = {
  serial_number: 'serial number',
  serialNumber: 'serial number',
  name: 'name',
  set_code: 'set code',
  setCode: 'set code',
};

// Which columns broke the UNIQUE rule. Prisma 7 with the PostgreSQL driver adapter reports the
// index name (for example "categories_name_key", PostgreSQL's "<table>_<columns>_key"); older
// setups report a list of fields in meta.target.
function uniqueFields(err) {
  const meta = err.meta ?? {};
  if (Array.isArray(meta.target)) return meta.target;
  if (typeof meta.target === 'string') return [meta.target];

  const cause = meta.driverAdapterError?.cause ?? {};
  const constraint = cause.constraint ?? {};
  if (Array.isArray(constraint.fields)) {
    return constraint.fields.map((field) => field.replace(/"/g, ''));
  }
  if (typeof constraint.index === 'string') {
    const prefix = cause.table ? `${cause.table}_` : '';
    let column = constraint.index;
    if (prefix && column.startsWith(prefix)) column = column.slice(prefix.length);
    return [column.replace(/_key$/, '')];
  }
  return [];
}

function mapPrismaError(err, { entity }) {
  if (!err || typeof err.code !== 'string') return err;

  if (err.code === UNIQUE_CONSTRAINT_FAILED) {
    const fields = uniqueFields(err).map((field) => FIELD_LABELS[field] ?? field);
    const what = fields.length > 0 ? fields.join(', ') : 'value';
    return new AppError(409, `${entity} with this ${what} already exists`);
  }
  // The only foreign key a product or category write can break is the product's category.
  if (err.code === FOREIGN_KEY_FAILED) {
    return new AppError(400, 'Category not found');
  }
  return err;
}

module.exports = { mapPrismaError, uniqueFields };
