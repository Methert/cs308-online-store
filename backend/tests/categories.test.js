// Category list and products by category:
//   GET /api/categories, GET /api/categories/:id, GET /api/categories/:id/products,
//   GET /api/products?categoryId=
// Category management by the product manager: POST, PATCH, DELETE /api/categories
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const { seedCatalog } = require('./helpers/inMemoryCatalogRepositories');
const { ROLES } = require('../src/constants/roles');

async function setup() {
  const ctx = createTestApp();
  const seeded = await seedCatalog(ctx.catalog);
  return { ...ctx, seeded };
}

describe('GET /api/categories', () => {
  test('lists the card sets, newest first, with their number of products on sale', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([
      {
        id: expect.any(Number),
        name: '151',
        description: null,
        setCode: 'sv3pt5',
        series: 'Scarlet & Violet',
        releaseDate: '2023-09-22',
        productCount: 3,
      },
      {
        id: expect.any(Number),
        name: 'Base Set',
        description: null,
        setCode: 'base1',
        series: 'Base',
        releaseDate: '1999-01-09',
        productCount: 2, // the removed product is not counted
      },
    ]);
  });

  test('an empty shop has no categories', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual([]);
  });
});

describe('GET /api/categories/:id', () => {
  test('returns one category', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(`/api/categories/${seeded.base.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.category).toMatchObject({ id: seeded.base.id, name: 'Base Set' });
  });

  test('gives 404 for an unknown category and 400 for an invalid id', async () => {
    const { app } = await setup();

    expect((await request(app).get('/api/categories/999')).status).toBe(404);
    expect((await request(app).get('/api/categories/base')).status).toBe(400);
  });
});

describe('GET /api/categories/:id/products', () => {
  test('lists only the products of that card set', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(`/api/categories/${seeded.sv151.id}/products`);

    expect(res.status).toBe(200);
    expect(res.body.data.products.map((p) => p.name)).toEqual([
      'Charizard ex',
      'Charmander',
      'Pikachu',
    ]);
    expect(res.body.data.products.every((p) => p.category.id === seeded.sv151.id)).toBe(true);
    expect(res.body.data.pagination.total).toBe(3);
  });

  test('can be searched and sorted like the main list', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(
      `/api/categories/${seeded.sv151.id}/products?q=char&sort=price_asc`,
    );

    expect(res.body.data.products.map((p) => p.name)).toEqual(['Charmander', 'Charizard ex']);
  });

  test('does not list removed products of the set', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(`/api/categories/${seeded.base.id}/products`);

    expect(res.body.data.products.map((p) => p.id)).not.toContain(seeded.removed.id);
  });

  test('gives 404 for an unknown category', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/categories/999/products');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Category not found' });
  });

  test('a category with no products gives an empty list', async () => {
    const { app, catalog } = await setup();
    const empty = await catalog.categoryRepository.create({ name: 'Crown Zenith' });

    const res = await request(app).get(`/api/categories/${empty.id}/products`);

    expect(res.status).toBe(200);
    expect(res.body.data.products).toEqual([]);
  });
});

describe('GET /api/products?categoryId=', () => {
  test('filters the main product list by card set', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(`/api/products?categoryId=${seeded.base.id}`);

    expect(res.body.data.products.map((p) => p.name)).toEqual(['Blastoise', 'Charizard']);
  });

  test('an unknown category id gives an empty list', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?categoryId=999');

    expect(res.status).toBe(200);
    expect(res.body.data.products).toEqual([]);
  });

  test('rejects a category id that is not a number', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?categoryId=base');

    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('categoryId');
  });
});

describe('category management', () => {
  test('a product manager creates a category (201)', async () => {
    const { app, bearerFor } = await setup();

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER))
      .send({
        name: '  Crown Zenith ',
        setCode: 'swsh12pt5',
        series: 'Sword & Shield',
        releaseDate: '2023-01-20',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.category).toEqual({
      id: expect.any(Number),
      name: 'Crown Zenith',
      description: null,
      setCode: 'swsh12pt5',
      series: 'Sword & Shield',
      releaseDate: '2023-01-20',
      productCount: 0,
    });
  });

  test.each([
    [null, 401],
    [ROLES.CUSTOMER, 403],
    [ROLES.SALES_MANAGER, 403],
    [ROLES.SUPPORT_AGENT, 403],
  ])('role %s cannot create a category (%i)', async (role, status) => {
    const { app, bearerFor } = await setup();

    const req = request(app).post('/api/categories');
    if (role) req.set('Authorization', bearerFor(role));
    const res = await req.send({ name: 'Crown Zenith' });

    expect(res.status).toBe(status);
  });

  test('rejects a missing name, an impossible date and unknown fields', async () => {
    const { app, bearerFor } = await setup();
    const pm = bearerFor(ROLES.PRODUCT_MANAGER);

    const noName = await request(app).post('/api/categories').set('Authorization', pm).send({});
    const badDate = await request(app)
      .post('/api/categories')
      .set('Authorization', pm)
      .send({ name: 'X', releaseDate: '2023-02-30' });
    const unknown = await request(app)
      .post('/api/categories')
      .set('Authorization', pm)
      .send({ name: 'X', colour: 'red' });

    expect(noName.status).toBe(400);
    expect(badDate.status).toBe(400);
    expect(badDate.body.details[0]).toEqual({
      field: 'releaseDate',
      message: 'Release date is not a real date',
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.details[0].message).toBe('Unknown field: colour');
  });

  test('a duplicate name gives 409', async () => {
    const { app, bearerFor } = await setup();

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER))
      .send({ name: 'Base Set' });

    expect(res.status).toBe(409);
  });

  test('a product manager renames a category and clears its date', async () => {
    const { app, bearerFor, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/categories/${seeded.base.id}`)
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER))
      .send({ name: 'Base Set (1999)', releaseDate: null });

    expect(res.status).toBe(200);
    expect(res.body.data.category).toMatchObject({ name: 'Base Set (1999)', releaseDate: null });
  });

  test('updating needs at least one field and an existing category', async () => {
    const { app, bearerFor, seeded } = await setup();
    const pm = bearerFor(ROLES.PRODUCT_MANAGER);

    const empty = await request(app)
      .patch(`/api/categories/${seeded.base.id}`)
      .set('Authorization', pm)
      .send({});
    const missing = await request(app)
      .patch('/api/categories/999')
      .set('Authorization', pm)
      .send({ name: 'New' });

    expect(empty.status).toBe(400);
    expect(missing.status).toBe(404);
  });

  test('a category with products cannot be deleted (409)', async () => {
    const { app, bearerFor, seeded } = await setup();

    const res = await request(app)
      .delete(`/api/categories/${seeded.base.id}`)
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER));

    expect(res.status).toBe(409);
  });

  test('an empty category is deleted (204) and then gone (404)', async () => {
    const { app, bearerFor, catalog } = await setup();
    const pm = bearerFor(ROLES.PRODUCT_MANAGER);
    const empty = await catalog.categoryRepository.create({ name: 'Crown Zenith' });

    const first = await request(app).delete(`/api/categories/${empty.id}`).set('Authorization', pm);
    const second = await request(app)
      .delete(`/api/categories/${empty.id}`)
      .set('Authorization', pm);

    expect(first.status).toBe(204);
    expect(first.body).toEqual({});
    expect(second.status).toBe(404);
  });

  test('a customer cannot delete a category', async () => {
    const { app, bearerFor, catalog } = await setup();
    const empty = await catalog.categoryRepository.create({ name: 'Crown Zenith' });

    const res = await request(app)
      .delete(`/api/categories/${empty.id}`)
      .set('Authorization', bearerFor(ROLES.CUSTOMER));

    expect(res.status).toBe(403);
    expect(await catalog.categoryRepository.exists(empty.id)).toBe(true);
  });
});
