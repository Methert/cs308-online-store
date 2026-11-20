// The ONLY place that talks to the products table (and reads order lines for popularity).
// Services use this object instead of Prisma directly, so tests can pass a fake in-memory one
// (tests/helpers/inMemoryCatalogRepositories.js).
const { AppError } = require('../utils/AppError');
const { mapPrismaError } = require('./prismaErrors');

// Every product is returned together with its card set (category).
const WITH_CATEGORY = {
  category: { select: { id: true, name: true, setCode: true, series: true } },
};

// Sort orders of the product list. The id at the end makes the order stable when two products
// have the same price or name, so a product never shows up on two pages.
const ORDER_BY = {
  name_asc: [{ name: 'asc' }, { id: 'asc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
};

// Prisma's "contains" turns the text into  ILIKE '%text%'  without escaping, so a search for
// "%" or "_" would match every product. A backslash in front makes PostgreSQL read them
// literally.
function escapeLikePattern(text) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Builds the Prisma "where" of a product list.
 * @param {object} filters
 * @param {string} [filters.q]           text searched in the name and the description (req. 7)
 * @param {number} [filters.categoryId]  only this card set
 * @param {'active'|'inactive'|'all'} [filters.status]  removed products are "inactive"
 */
function buildProductWhere({ q, categoryId, status = 'active' } = {}) {
  const where = {};
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;
  if (categoryId !== undefined) where.categoryId = categoryId;
  if (q) {
    const contains = escapeLikePattern(q);
    where.OR = [
      { name: { contains, mode: 'insensitive' } },
      { description: { contains, mode: 'insensitive' } },
    ];
  }
  return where;
}

function createProductRepository(prisma) {
  // Copies sold per product: the sum of the quantities in orders that were not cancelled.
  // This is what "popularity" means in this shop (requirement 7).
  async function soldCounts(productIds) {
    const counts = new Map();
    if (productIds.length === 0) return counts;
    const rows = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds }, order: { status: { not: 'cancelled' } } },
      _sum: { quantity: true },
    });
    for (const row of rows) counts.set(row.productId, row._sum.quantity ?? 0);
    return counts;
  }

  function withSoldCount(products, counts) {
    return products.map((product) => ({ ...product, soldCount: counts.get(product.id) ?? 0 }));
  }

  // Popularity needs the sales numbers of every matching product before it can pick a page,
  // so the ids are sorted here in JavaScript. That is fine for a shop with hundreds of
  // products; a very large catalog would keep a "sold count" column instead.
  async function listByPopularity(where, skip, take) {
    const rows = await prisma.product.findMany({ where, select: { id: true } });
    const counts = await soldCounts(rows.map((row) => row.id));
    const ordered = rows
      .map((row) => row.id)
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a - b);
    const pageIds = ordered.slice(skip, skip + take);

    const products = await prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: WITH_CATEGORY,
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const items = pageIds.map((id) => byId.get(id)).filter(Boolean);
    return { items: withSoldCount(items, counts), total: rows.length };
  }

  // Returns null if there is no product with this id.
  async function findById(id) {
    const product = await prisma.product.findUnique({ where: { id }, include: WITH_CATEGORY });
    if (!product) return null;
    const counts = await soldCounts([id]);
    return withSoldCount([product], counts)[0];
  }

  return {
    /**
     * One page of products.
     * @returns {Promise<{ items: object[], total: number }>} total = all matches, not just
     *   this page
     */
    async list({ q, categoryId, status, sort = 'name_asc', skip = 0, take = 20 }) {
      const where = buildProductWhere({ q, categoryId, status });
      if (sort === 'popularity') return listByPopularity(where, skip, take);

      const orderBy = ORDER_BY[sort];
      if (!orderBy) throw new Error(`Unknown sort: ${sort}`);

      const [items, total] = await prisma.$transaction([
        prisma.product.findMany({ where, orderBy, skip, take, include: WITH_CATEGORY }),
        prisma.product.count({ where }),
      ]);
      const counts = await soldCounts(items.map((product) => product.id));
      return { items: withSoldCount(items, counts), total };
    },

    findById,

    async create(data) {
      try {
        const product = await prisma.product.create({ data, include: WITH_CATEGORY });
        return { ...product, soldCount: 0 };
      } catch (err) {
        throw mapPrismaError(err, { entity: 'Product' });
      }
    },

    // Returns null if there is no product with this id.
    async update(id, data) {
      try {
        await prisma.product.update({ where: { id }, data });
      } catch (err) {
        if (err && err.code === 'P2025') return null;
        throw mapPrismaError(err, { entity: 'Product' });
      }
      return findById(id);
    },

    // "Deleting" a product hides it from the shop but keeps the row, because old orders,
    // invoices and reviews point at it. It is also taken out of every cart, so nobody can
    // order a product that is no longer sold. Both happen together or not at all.
    // Returns null if there is no product with this id.
    async deactivate(id) {
      try {
        await prisma.$transaction([
          prisma.product.update({ where: { id }, data: { isActive: false } }),
          prisma.cartItem.deleteMany({ where: { productId: id } }),
        ]);
      } catch (err) {
        if (err && err.code === 'P2025') return null;
        throw err;
      }
      return findById(id);
    },

    // Sets the stock to an exact number (for example after counting the shelf).
    // Returns null if there is no product with this id.
    async setStock(id, stockQuantity) {
      try {
        await prisma.product.update({ where: { id }, data: { stockQuantity } });
      } catch (err) {
        if (err && err.code === 'P2025') return null;
        throw err;
      }
      return findById(id);
    },

    // Adds (change > 0) or removes (change < 0) copies in ONE database statement:
    //   UPDATE products SET stock_quantity = stock_quantity + change
    //   WHERE id = ? AND stock_quantity >= -change
    // The database does the arithmetic, so a checkout that lowers the stock at the same moment
    // is never overwritten (requirement 18), and the stock can never go below zero.
    // Returns null if there is no product with this id.
    async adjustStock(id, change) {
      const where = change < 0 ? { id, stockQuantity: { gte: -change } } : { id };
      const result = await prisma.product.updateMany({
        where,
        data: { stockQuantity: { increment: change } },
      });
      if (result.count === 0) {
        const current = await prisma.product.findUnique({
          where: { id },
          select: { stockQuantity: true },
        });
        if (!current) return null;
        throw new AppError(
          409,
          `Not enough stock: only ${current.stockQuantity} left, cannot remove ${-change}`,
        );
      }
      return findById(id);
    },
  };
}

module.exports = { createProductRepository, buildProductWhere, escapeLikePattern, ORDER_BY };
