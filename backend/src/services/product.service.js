// Business rules of the product catalog (requirements 1, 3, 7, 9 and 12). No HTTP and no
// database code here: the routes call these functions and the repository does the queries.
const { AppError } = require('../utils/AppError');

// Prisma returns DECIMAL columns as Decimal objects, which JSON would turn into strings
// ("129.9"). The API sends plain numbers; DECIMAL(10, 2) fits a JavaScript number exactly
// enough for prices.
function toMoney(value) {
  return value === null || value === undefined ? null : Number(value);
}

function toCategorySummary(category) {
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    setCode: category.setCode ?? null,
    series: category.series ?? null,
  };
}

// What every visitor sees. Requirement 9 fields, plus the card set, the picture and whether it
// can be put in the cart (requirement 7: sold-out cards are listed but cannot be added).
function toPublicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    model: product.model,
    serialNumber: product.serialNumber,
    description: product.description,
    rarity: product.rarity,
    condition: product.condition,
    price: toMoney(product.price),
    stockQuantity: product.stockQuantity,
    inStock: product.stockQuantity > 0,
    warrantyStatus: product.warrantyStatus,
    distributor: product.distributor,
    imageUrl: product.imageUrl ?? null,
    soldCount: product.soldCount ?? 0,
    category: toCategorySummary(product.category),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// Product and sales managers also see the cost (for profit, requirement 11) and whether the
// product is still on sale. Customers never get the cost.
function toManagedProduct(product) {
  return {
    ...toPublicProduct(product),
    cost: toMoney(product.cost),
    isActive: product.isActive,
  };
}

function toPagination({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function createProductService({ productRepository, categoryRepository }) {
  async function list({ q, categoryId, status, sort, page, limit }, toView) {
    const { items, total } = await productRepository.list({
      q,
      categoryId,
      status,
      sort,
      skip: (page - 1) * limit,
      take: limit,
    });
    return { products: items.map(toView), pagination: toPagination({ page, limit, total }) };
  }

  async function ensureCategoryExists(categoryId) {
    if (!(await categoryRepository.exists(categoryId))) {
      throw new AppError(400, 'Category not found');
    }
  }

  async function findOrThrow(id) {
    const product = await productRepository.findById(id);
    if (!product) throw new AppError(404, 'Product not found');
    return product;
  }

  return {
    // Shop listing, search and sort. Only products on sale.
    listProducts(query) {
      return list({ ...query, status: 'active' }, toPublicProduct);
    },

    // Products of one card set. 404 if the set does not exist, so the frontend can tell
    // "unknown category" apart from "category with no cards".
    async listProductsInCategory(categoryId, query) {
      if (!(await categoryRepository.exists(categoryId))) {
        throw new AppError(404, 'Category not found');
      }
      return list({ ...query, categoryId, status: 'active' }, toPublicProduct);
    },

    // Product detail page. A removed product is "not found" for visitors.
    async getProduct(id) {
      const product = await productRepository.findById(id);
      if (!product || !product.isActive) throw new AppError(404, 'Product not found');
      return toPublicProduct(product);
    },

    // --- Product manager -----------------------------------------------------

    listManagedProducts(query) {
      return list(query, toManagedProduct);
    },

    async getManagedProduct(id) {
      return toManagedProduct(await findOrThrow(id));
    },

    async createProduct(data) {
      await ensureCategoryExists(data.categoryId);
      return toManagedProduct(await productRepository.create(data));
    },

    async updateProduct(id, changes) {
      await findOrThrow(id);
      if (changes.categoryId !== undefined) await ensureCategoryExists(changes.categoryId);
      const product = await productRepository.update(id, changes);
      if (!product) throw new AppError(404, 'Product not found');
      return toManagedProduct(product);
    },

    // Takes the product off sale (see productRepository.deactivate). Removing it twice is fine.
    async removeProduct(id) {
      const product = await productRepository.deactivate(id);
      if (!product) throw new AppError(404, 'Product not found');
      return toManagedProduct(product);
    },

    // { stockQuantity } sets the stock, { change } adds or removes copies.
    async updateStock(id, { stockQuantity, change }) {
      const product =
        change !== undefined
          ? await productRepository.adjustStock(id, change)
          : await productRepository.setStock(id, stockQuantity);
      if (!product) throw new AppError(404, 'Product not found');
      return toManagedProduct(product);
    },
  };
}

module.exports = { createProductService, toPublicProduct, toManagedProduct };
