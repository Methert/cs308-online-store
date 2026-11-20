// Fake product and category repositories that keep the data in arrays.
// They behave like src/repositories/product.repository.js and category.repository.js, so the
// route and service tests run without a database.
const { AppError } = require('../../src/utils/AppError');

const COMPARE = {
  name_asc: (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id),
  price_asc: (a, b) => a.price - b.price || a.id - b.id,
  price_desc: (a, b) => b.price - a.price || a.id - b.id,
  newest: (a, b) => b.createdAt - a.createdAt || b.id - a.id,
};

function createInMemoryCatalog() {
  const categories = [];
  const products = [];
  // productId -> copies sold in orders that were not cancelled
  const sales = new Map();
  // productId -> number of cart lines holding it (to check that removal empties carts)
  const cartLines = new Map();
  let nextCategoryId = 1;
  let nextProductId = 1;

  const categoryOf = (product) => {
    const category = categories.find((c) => c.id === product.categoryId);
    return category
      ? { id: category.id, name: category.name, setCode: category.setCode, series: category.series }
      : null;
  };
  const view = (product) => ({
    ...product,
    category: categoryOf(product),
    soldCount: sales.get(product.id) ?? 0,
  });

  function matches(product, { q, categoryId, status = 'active' }) {
    if (status === 'active' && !product.isActive) return false;
    if (status === 'inactive' && product.isActive) return false;
    if (categoryId !== undefined && product.categoryId !== categoryId) return false;
    if (q) {
      const needle = q.toLowerCase();
      return (
        product.name.toLowerCase().includes(needle) ||
        product.description.toLowerCase().includes(needle)
      );
    }
    return true;
  }

  function assertUniqueSerial(serialNumber, exceptId) {
    if (products.some((p) => p.serialNumber === serialNumber && p.id !== exceptId)) {
      throw new AppError(409, 'Product with this serial number already exists');
    }
  }

  const productRepository = {
    async list({ q, categoryId, status, sort = 'name_asc', skip = 0, take = 20 }) {
      const found = products.filter((p) => matches(p, { q, categoryId, status }));
      const compare =
        sort === 'popularity'
          ? (a, b) => (sales.get(b.id) ?? 0) - (sales.get(a.id) ?? 0) || a.id - b.id
          : COMPARE[sort];
      found.sort(compare);
      return { items: found.slice(skip, skip + take).map(view), total: found.length };
    },

    async findById(id) {
      const product = products.find((p) => p.id === id);
      return product ? view(product) : null;
    },

    async create(data) {
      assertUniqueSerial(data.serialNumber);
      const now = new Date(Date.now() + nextProductId); // distinct times for "newest"
      const product = {
        id: nextProductId++,
        condition: 'near_mint',
        stockQuantity: 0,
        cost: null,
        imageUrl: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      products.push(product);
      return view(product);
    },

    async update(id, data) {
      const product = products.find((p) => p.id === id);
      if (!product) return null;
      if (data.serialNumber !== undefined) assertUniqueSerial(data.serialNumber, id);
      Object.assign(product, data, { updatedAt: new Date() });
      return view(product);
    },

    async deactivate(id) {
      const product = products.find((p) => p.id === id);
      if (!product) return null;
      product.isActive = false;
      cartLines.delete(id);
      return view(product);
    },

    async setStock(id, stockQuantity) {
      const product = products.find((p) => p.id === id);
      if (!product) return null;
      product.stockQuantity = stockQuantity;
      return view(product);
    },

    async adjustStock(id, change) {
      const product = products.find((p) => p.id === id);
      if (!product) return null;
      if (product.stockQuantity + change < 0) {
        throw new AppError(
          409,
          `Not enough stock: only ${product.stockQuantity} left, cannot remove ${-change}`,
        );
      }
      product.stockQuantity += change;
      return view(product);
    },
  };

  const withCount = (category) => ({
    ...category,
    productCount: products.filter((p) => p.categoryId === category.id && p.isActive).length,
  });

  const categoryRepository = {
    async list() {
      return [...categories]
        .sort(
          (a, b) =>
            (b.releaseDate?.getTime() ?? -Infinity) - (a.releaseDate?.getTime() ?? -Infinity) ||
            a.name.localeCompare(b.name),
        )
        .map(withCount);
    },

    async findById(id) {
      const category = categories.find((c) => c.id === id);
      return category ? withCount(category) : null;
    },

    async exists(id) {
      return categories.some((c) => c.id === id);
    },

    async create(data) {
      if (categories.some((c) => c.name === data.name)) {
        throw new AppError(409, 'Category with this name already exists');
      }
      const category = {
        id: nextCategoryId++,
        description: null,
        setCode: null,
        series: null,
        releaseDate: null,
        ...data,
      };
      categories.push(category);
      return withCount(category);
    },

    async update(id, data) {
      const category = categories.find((c) => c.id === id);
      if (!category) return null;
      if (data.name !== undefined && categories.some((c) => c.name === data.name && c.id !== id)) {
        throw new AppError(409, 'Category with this name already exists');
      }
      Object.assign(category, data);
      return withCount(category);
    },

    async remove(id) {
      const index = categories.findIndex((c) => c.id === id);
      if (index === -1) return false;
      if (products.some((p) => p.categoryId === id)) {
        throw new AppError(409, 'Category still has products');
      }
      categories.splice(index, 1);
      return true;
    },
  };

  return { productRepository, categoryRepository, categories, products, sales, cartLines };
}

// Valid example product for the create form. A test only writes the field it changes.
function validProduct(overrides = {}) {
  return {
    categoryId: 1,
    name: 'Charizard ex',
    model: '199/165',
    serialNumber: 'SV3PT5-199-NM',
    rarity: 'Special Illustration Rare',
    condition: 'near_mint',
    description: 'Charizard soars between canyon walls.',
    price: 129.9,
    cost: 60,
    stockQuantity: 3,
    warrantyStatus: '30-day authenticity guarantee',
    distributor: 'The Pokémon Company International',
    imageUrl: '/images/cards/sv03.5/199.webp',
    ...overrides,
  };
}

// Fills the fake catalog: two card sets and six products, one of them sold out and one removed.
async function seedCatalog(catalog) {
  const base = await catalog.categoryRepository.create({
    name: 'Base Set',
    setCode: 'base1',
    series: 'Base',
    releaseDate: new Date('1999-01-09T00:00:00.000Z'),
  });
  const sv151 = await catalog.categoryRepository.create({
    name: '151',
    setCode: 'sv3pt5',
    series: 'Scarlet & Violet',
    releaseDate: new Date('2023-09-22T00:00:00.000Z'),
  });
  const add = (overrides) => catalog.productRepository.create(validProduct(overrides));

  const charizardEx = await add({ categoryId: sv151.id });
  const pikachu = await add({
    categoryId: sv151.id,
    name: 'Pikachu',
    model: '173/165',
    serialNumber: 'SV3PT5-173-NM',
    description: 'Pikachu takes a stroll through a lively city street.',
    price: 22.5,
    stockQuantity: 7,
  });
  const charmander = await add({
    categoryId: sv151.id,
    name: 'Charmander',
    model: '168/165',
    serialNumber: 'SV3PT5-168-NM',
    description: 'A small fire lizard looks out over a rocky landscape.',
    price: 36.9,
    stockQuantity: 0, // sold out
  });
  const baseCharizard = await add({
    categoryId: base.id,
    name: 'Charizard',
    model: '4/102',
    serialNumber: 'BASE1-4-NM',
    description: 'The classic holo fire dragon from 1999.',
    price: 450,
    stockQuantity: 1,
  });
  const blastoise = await add({
    categoryId: base.id,
    name: 'Blastoise',
    model: '2/102',
    serialNumber: 'BASE1-2-NM',
    description: 'A water cannon turtle; its rival is a Charizard.',
    price: 22.5,
    stockQuantity: 2,
  });
  const removed = await add({
    categoryId: base.id,
    name: 'Charizard Removed',
    model: '4/102',
    serialNumber: 'BASE1-4-PL',
    description: 'Played copy, no longer sold.',
    price: 300,
    stockQuantity: 1,
  });
  await catalog.productRepository.deactivate(removed.id);

  return { base, sv151, charizardEx, pikachu, charmander, baseCharizard, blastoise, removed };
}

module.exports = { createInMemoryCatalog, validProduct, seedCatalog };
