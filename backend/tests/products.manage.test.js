// Product and stock management for product managers (requirements 9 and 12):
//   POST /api/products, PATCH /api/products/:id, DELETE /api/products/:id,
//   PATCH /api/products/:id/stock, GET /api/products/manage, GET /api/products/manage/:id
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const { seedCatalog, validProduct } = require('./helpers/inMemoryCatalogRepositories');
const { ROLES } = require('../src/constants/roles');

async function setup() {
  const ctx = createTestApp();
  const seeded = await seedCatalog(ctx.catalog);
  const pm = ctx.bearerFor(ROLES.PRODUCT_MANAGER);
  return { ...ctx, seeded, pm };
}

function newProduct(seeded, overrides = {}) {
  return validProduct({
    categoryId: seeded.sv151.id,
    name: 'Mew ex',
    model: '193/165',
    serialNumber: 'SV3PT5-193-NM',
    price: 19.9,
    cost: 8,
    stockQuantity: 5,
    ...overrides,
  });
}

describe('who may manage products', () => {
  const writes = [
    ['POST', '/api/products'],
    ['PATCH', '/api/products/1'],
    ['DELETE', '/api/products/1'],
    ['PATCH', '/api/products/1/stock'],
  ];

  test.each(writes)('%s %s needs a login (401)', async (method, url) => {
    const { app } = await setup();

    const res = await request(app)[method.toLowerCase()](url).send({});

    expect(res.status).toBe(401);
  });

  test.each([ROLES.CUSTOMER, ROLES.SALES_MANAGER, ROLES.SUPPORT_AGENT])(
    'a %s cannot add, change, remove or restock products (403)',
    async (role) => {
      const { app, bearerFor, seeded } = await setup();
      const auth = bearerFor(role);

      const statuses = await Promise.all(
        writes.map(([method, url]) =>
          request(app)
            [method.toLowerCase()](url)
            .set('Authorization', auth)
            .send(newProduct(seeded))
            .then((res) => res.status),
        ),
      );

      expect(statuses).toEqual([403, 403, 403, 403]);
    },
  );
});

describe('POST /api/products', () => {
  test('a product manager adds a product (201) and sees its cost', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', pm)
      .send(newProduct(seeded));

    expect(res.status).toBe(201);
    expect(res.body.data.product).toMatchObject({
      id: expect.any(Number),
      name: 'Mew ex',
      price: 19.9,
      cost: 8,
      stockQuantity: 5,
      inStock: true,
      isActive: true,
      soldCount: 0,
      category: { id: seeded.sv151.id, name: '151' },
    });
  });

  test('the new product shows up in the shop', async () => {
    const { app, pm, seeded } = await setup();

    await request(app).post('/api/products').set('Authorization', pm).send(newProduct(seeded));
    const res = await request(app).get('/api/products?q=mew');

    expect(res.body.data.products.map((p) => p.name)).toEqual(['Mew ex']);
  });

  test('stock defaults to 0, condition to near_mint and cost to empty', async () => {
    const { app, pm, seeded } = await setup();
    const { stockQuantity, condition, cost, ...body } = newProduct(seeded);

    const res = await request(app).post('/api/products').set('Authorization', pm).send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.product).toMatchObject({
      stockQuantity: 0,
      inStock: false,
      condition: 'near_mint',
      cost: null,
    });
  });

  test('trims spaces from text fields', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', pm)
      .send(newProduct(seeded, { name: '  Mew ex  ' }));

    expect(res.body.data.product.name).toBe('Mew ex');
  });

  test.each([
    ['name', ''],
    ['model', undefined],
    ['serialNumber', '   '],
    ['description', undefined],
    ['warrantyStatus', undefined],
    ['distributor', undefined],
    ['rarity', undefined],
    ['price', undefined],
    ['price', -1],
    ['price', '19.90'],
    ['price', 19.999],
    ['price', 100000000],
    ['cost', -5],
    ['stockQuantity', -1],
    ['stockQuantity', 2.5],
    ['condition', 'like_new'],
    ['categoryId', 0],
    ['categoryId', 'one'],
    ['imageUrl', 'javascript:alert(1)'],
    ['imageUrl', '//evil.example/x.png'],
  ])('rejects %s = %p with 400', async (field, value) => {
    const { app, pm, seeded } = await setup();
    const body = newProduct(seeded, { [field]: value });

    const res = await request(app).post('/api/products').set('Authorization', pm).send(body);

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain(field);
  });

  test('accepts a picture served by the API or an https address', async () => {
    const { app, pm, seeded } = await setup();

    const local = await request(app)
      .post('/api/products')
      .set('Authorization', pm)
      .send(newProduct(seeded, { imageUrl: '/images/cards/sv03.5/193.webp' }));
    const remote = await request(app)
      .post('/api/products')
      .set('Authorization', pm)
      .send(newProduct(seeded, { serialNumber: 'X-2', imageUrl: 'https://cdn.example/193.png' }));

    expect(local.status).toBe(201);
    expect(remote.status).toBe(201);
  });

  test('rejects unknown fields so typos are noticed', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', pm)
      .send({ ...newProduct(seeded), stok: 3 });

    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toBe('Unknown field: stok');
  });

  test('a category that does not exist gives 400', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', pm)
      .send(newProduct(seeded, { categoryId: 999 }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Category not found' });
  });

  test('a serial number that is already used gives 409', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', pm)
      .send(newProduct(seeded, { serialNumber: seeded.pikachu.serialNumber }));

    expect(res.status).toBe(409);
  });

  test('the role in a token cannot be faked by the request body', async () => {
    const { app, bearerFor, seeded } = await setup();

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', bearerFor(ROLES.CUSTOMER))
      .send({ ...newProduct(seeded), role: 'product_manager' });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/products/:id', () => {
  test('changes only the fields that are sent', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}`)
      .set('Authorization', pm)
      .send({ price: 24.99, description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.data.product).toMatchObject({
      name: 'Pikachu',
      price: 24.99,
      description: 'Updated description',
      stockQuantity: 7,
    });
  });

  test('moves a product to another card set', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}`)
      .set('Authorization', pm)
      .send({ categoryId: seeded.base.id });

    expect(res.body.data.product.category).toMatchObject({ id: seeded.base.id });
  });

  test('clears the cost with null', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}`)
      .set('Authorization', pm)
      .send({ cost: null });

    expect(res.body.data.product.cost).toBeNull();
  });

  test('refuses stock changes and points to the stock endpoint', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}`)
      .set('Authorization', pm)
      .send({ stockQuantity: 100 });

    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/PATCH \/api\/products\/:id\/stock/);
  });

  test('needs at least one field', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}`)
      .set('Authorization', pm)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toBe('Send at least one field to update');
  });

  test('gives 404 for an unknown product and 400 for an unknown category', async () => {
    const { app, pm, seeded } = await setup();

    const missing = await request(app)
      .patch('/api/products/999')
      .set('Authorization', pm)
      .send({ price: 1 });
    const badCategory = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}`)
      .set('Authorization', pm)
      .send({ categoryId: 999 });

    expect(missing.status).toBe(404);
    expect(badCategory.status).toBe(400);
  });

  test("gives 409 when the new serial number is another product's", async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}`)
      .set('Authorization', pm)
      .send({ serialNumber: seeded.blastoise.serialNumber });

    expect(res.status).toBe(409);
  });

  test('isActive: true puts a removed product back on sale', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.removed.id}`)
      .set('Authorization', pm)
      .send({ isActive: true });
    const detail = await request(app).get(`/api/products/${seeded.removed.id}`);

    expect(res.body.data.product.isActive).toBe(true);
    expect(detail.status).toBe(200);
  });
});

describe('DELETE /api/products/:id', () => {
  test('takes the product off sale but keeps it for old orders', async () => {
    const { app, pm, seeded, catalog } = await setup();

    const res = await request(app)
      .delete(`/api/products/${seeded.pikachu.id}`)
      .set('Authorization', pm);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toMatchObject({ id: seeded.pikachu.id, isActive: false });
    expect(catalog.products.find((p) => p.id === seeded.pikachu.id)).toBeDefined();
  });

  test('a removed product disappears from the shop list, search and detail', async () => {
    const { app, pm, seeded } = await setup();

    await request(app).delete(`/api/products/${seeded.pikachu.id}`).set('Authorization', pm);
    const list = await request(app).get('/api/products?q=pikachu');
    const detail = await request(app).get(`/api/products/${seeded.pikachu.id}`);

    expect(list.body.data.products).toEqual([]);
    expect(detail.status).toBe(404);
  });

  test('takes the product out of every cart', async () => {
    const { app, pm, seeded, catalog } = await setup();
    catalog.cartLines.set(seeded.pikachu.id, 2);

    await request(app).delete(`/api/products/${seeded.pikachu.id}`).set('Authorization', pm);

    expect(catalog.cartLines.has(seeded.pikachu.id)).toBe(false);
  });

  test('removing twice is fine; an unknown id gives 404', async () => {
    const { app, pm, seeded } = await setup();

    const again = await request(app)
      .delete(`/api/products/${seeded.removed.id}`)
      .set('Authorization', pm);
    const missing = await request(app).delete('/api/products/999').set('Authorization', pm);

    expect(again.status).toBe(200);
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/products/:id/stock', () => {
  test('sets the stock to an exact number', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}/stock`)
      .set('Authorization', pm)
      .send({ stockQuantity: 12 });

    expect(res.status).toBe(200);
    expect(res.body.data.product).toMatchObject({ stockQuantity: 12, inStock: true });
  });

  test('setting the stock to 0 makes the product sold out', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}/stock`)
      .set('Authorization', pm)
      .send({ stockQuantity: 0 });

    expect(res.body.data.product).toMatchObject({ stockQuantity: 0, inStock: false });
  });

  test('adds and removes copies with change', async () => {
    const { app, pm, seeded } = await setup();
    const url = `/api/products/${seeded.pikachu.id}/stock`;

    const added = await request(app).patch(url).set('Authorization', pm).send({ change: 3 });
    const removed = await request(app).patch(url).set('Authorization', pm).send({ change: -10 });

    expect(added.body.data.product.stockQuantity).toBe(10);
    expect(removed.body.data.product.stockQuantity).toBe(0);
  });

  test('refuses to remove more copies than there are (409) and keeps the stock', async () => {
    const { app, pm, seeded, catalog } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}/stock`)
      .set('Authorization', pm)
      .send({ change: -8 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Not enough stock: only 7 left, cannot remove 8');
    expect(catalog.products.find((p) => p.id === seeded.pikachu.id).stockQuantity).toBe(7);
  });

  test.each([
    [{}, 'neither field'],
    [{ stockQuantity: 5, change: 1 }, 'both fields'],
    [{ stockQuantity: -1 }, 'a negative stock'],
    [{ stockQuantity: 1.5 }, 'a fractional stock'],
    [{ stockQuantity: '5' }, 'stock as text'],
    [{ change: 0 }, 'a zero change'],
    [{ change: 0.5 }, 'a fractional change'],
    [{ amount: 3 }, 'an unknown field'],
  ])('rejects %p (%s) with 400', async (body) => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .patch(`/api/products/${seeded.pikachu.id}/stock`)
      .set('Authorization', pm)
      .send(body);

    expect(res.status).toBe(400);
  });

  test('gives 404 for an unknown product', async () => {
    const { app, pm } = await setup();

    const set = await request(app)
      .patch('/api/products/999/stock')
      .set('Authorization', pm)
      .send({ stockQuantity: 1 });
    const change = await request(app)
      .patch('/api/products/999/stock')
      .set('Authorization', pm)
      .send({ change: 1 });

    expect(set.status).toBe(404);
    expect(change.status).toBe(404);
  });
});

describe('GET /api/products/manage', () => {
  test('shows managers the cost and the active flag', async () => {
    const { app, pm } = await setup();

    const res = await request(app).get('/api/products/manage').set('Authorization', pm);

    expect(res.status).toBe(200);
    expect(res.body.data.products[0]).toHaveProperty('cost');
    expect(res.body.data.products[0]).toHaveProperty('isActive', true);
  });

  test('lists products on sale by default, removed ones or all with ?status=', async () => {
    const { app, pm } = await setup();
    const list = (status) =>
      request(app)
        .get(`/api/products/manage${status ? `?status=${status}` : ''}`)
        .set('Authorization', pm)
        .then((res) => res.body.data.pagination.total);

    expect(await list()).toBe(5);
    expect(await list('inactive')).toBe(1);
    expect(await list('all')).toBe(6);
  });

  test('a sales manager may read it too (for prices and profit)', async () => {
    const { app, bearerFor } = await setup();

    const res = await request(app)
      .get('/api/products/manage')
      .set('Authorization', bearerFor(ROLES.SALES_MANAGER));

    expect(res.status).toBe(200);
  });

  test('customers and guests may not read it', async () => {
    const { app, bearerFor } = await setup();

    const guest = await request(app).get('/api/products/manage');
    const customer = await request(app)
      .get('/api/products/manage')
      .set('Authorization', bearerFor(ROLES.CUSTOMER));

    expect(guest.status).toBe(401);
    expect(customer.status).toBe(403);
  });

  test('rejects an unknown status', async () => {
    const { app, pm } = await setup();

    const res = await request(app)
      .get('/api/products/manage?status=deleted')
      .set('Authorization', pm);

    expect(res.status).toBe(400);
  });

  test('GET /manage/:id shows a removed product to managers', async () => {
    const { app, pm, seeded } = await setup();

    const res = await request(app)
      .get(`/api/products/manage/${seeded.removed.id}`)
      .set('Authorization', pm);
    const missing = await request(app).get('/api/products/manage/999').set('Authorization', pm);

    expect(res.status).toBe(200);
    expect(res.body.data.product).toMatchObject({ id: seeded.removed.id, isActive: false });
    expect(missing.status).toBe(404);
  });
});
