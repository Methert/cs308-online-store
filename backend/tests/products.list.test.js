// Product list and product detail: GET /api/products and GET /api/products/:id
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const { seedCatalog } = require('./helpers/inMemoryCatalogRepositories');

async function setup() {
  const ctx = createTestApp();
  const seeded = await seedCatalog(ctx.catalog);
  return { ...ctx, seeded };
}

describe('GET /api/products', () => {
  test('lists the products on sale with the requirement 9 fields', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(5); // the removed product is not listed
    expect(res.body.data.products[0]).toEqual({
      id: expect.any(Number),
      name: expect.any(String),
      model: expect.any(String),
      serialNumber: expect.any(String),
      description: expect.any(String),
      rarity: expect.any(String),
      condition: expect.any(String),
      price: expect.any(Number),
      stockQuantity: expect.any(Number),
      inStock: expect.any(Boolean),
      warrantyStatus: expect.any(String),
      distributor: expect.any(String),
      imageUrl: expect.any(String),
      soldCount: expect.any(Number),
      category: {
        id: expect.any(Number),
        name: expect.any(String),
        setCode: expect.any(String),
        series: expect.any(String),
      },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  test('never shows the cost or the active flag to customers', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products');

    for (const product of res.body.data.products) {
      expect(product).not.toHaveProperty('cost');
      expect(product).not.toHaveProperty('isActive');
    }
  });

  test('is sorted by name by default', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products');

    expect(res.body.data.products.map((p) => p.name)).toEqual([
      'Blastoise',
      'Charizard',
      'Charizard ex',
      'Charmander',
      'Pikachu',
    ]);
  });

  test('returns pagination info, 20 per page by default', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products');

    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
  });

  test('splits the list into pages without repeating a product', async () => {
    const { app } = await setup();

    const page1 = await request(app).get('/api/products?limit=2&page=1');
    const page2 = await request(app).get('/api/products?limit=2&page=2');
    const page3 = await request(app).get('/api/products?limit=2&page=3');

    expect(page1.body.data.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    const ids = [page1, page2, page3].flatMap((res) => res.body.data.products.map((p) => p.id));
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  test('a page after the last one is empty, not an error', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?page=50');

    expect(res.status).toBe(200);
    expect(res.body.data.products).toEqual([]);
    expect(res.body.data.pagination.total).toBe(5);
  });

  test('marks a sold-out product as not in stock but still lists it (requirement 7)', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get('/api/products');

    const charmander = res.body.data.products.find((p) => p.id === seeded.charmander.id);
    expect(charmander).toMatchObject({ stockQuantity: 0, inStock: false });
  });

  test('an empty shop gives an empty list with zero pages', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      products: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  test.each([
    ['page=0', 'page'],
    ['page=-1', 'page'],
    ['page=1.5', 'page'],
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=ten', 'limit'],
  ])('rejects %s with 400', async (query, field) => {
    const { app } = await setup();

    const res = await request(app).get(`/api/products?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid query parameters');
    expect(res.body.details.map((d) => d.field)).toContain(field);
  });

  test('works without logging in', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
  });
});

describe('GET /api/products/:id', () => {
  test('returns one product with its card set', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(`/api/products/${seeded.pikachu.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toMatchObject({
      id: seeded.pikachu.id,
      name: 'Pikachu',
      model: '173/165',
      serialNumber: 'SV3PT5-173-NM',
      price: 22.5,
      stockQuantity: 7,
      inStock: true,
      category: { id: seeded.sv151.id, name: '151' },
    });
    expect(res.body.data.product).not.toHaveProperty('cost');
  });

  test('sends prices as numbers, not as text', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(`/api/products/${seeded.charizardEx.id}`);

    expect(res.body.data.product.price).toBe(129.9);
  });

  test('gives 404 for an id that does not exist', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products/9999');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found' });
  });

  test('gives 404 for a removed product', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(`/api/products/${seeded.removed.id}`);

    expect(res.status).toBe(404);
  });

  test.each(['abc', '0', '-5', '1.5', '1e3', '2147483648'])(
    'gives 400 (not 500) for the invalid id "%s"',
    async (id) => {
      const { app } = await setup();

      const res = await request(app).get(`/api/products/${id}`);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Product id must be a positive whole number' });
    },
  );
});
