// Unit tests for the cart API (GET /api/cart, POST /api/cart/items, etc.)
//
// All Prisma calls are replaced with Jest mock functions so the tests run without a database.
// Each test builds its own fake Prisma object to stay independent and avoid state leaking.
const request = require('supertest');
const { createApp }                    = require('../src/app');
const { buildTestConfig, silentLogger } = require('./helpers/testApp');
const { createInMemoryUserRepository } = require('./helpers/inMemoryUserRepository');
const { createTokenService }           = require('../src/utils/tokenService');

// ---------- helpers ----------------------------------------------------------

function buildFakePrisma() {
  const fake = {
    cart: {
      findUnique: jest.fn().mockResolvedValue(null),
      create:     jest.fn().mockResolvedValue({ id: 1, userId: null, guestToken: 'g1', items: [] }),
      delete:     jest.fn().mockResolvedValue({}),
    },
    cartItem: {
      upsert:     jest.fn().mockResolvedValue({ cartId: 1, productId: 1, quantity: 1 }),
      update:     jest.fn().mockResolvedValue({ cartId: 1, productId: 1, quantity: 2 }),
      delete:     jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    product: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $executeRaw:  jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  fake.$transaction.mockImplementation(async (cb) => cb(fake));
  return fake;
}

function createTestAppWithPrisma(fakePrisma) {
  const config         = buildTestConfig();
  const userRepository = createInMemoryUserRepository();
  const app = createApp({
    config,
    userRepository,
    checkDatabase: async () => {},
    prisma: fakePrisma,
    logger: silentLogger,
  });
  const tokenService = createTokenService(config.jwt);
  return { app, tokenService };
}

const ACTIVE_PRODUCT = {
  id: 1, name: 'Pikachu Base', price: 25, stockQuantity: 10, isActive: true,
};

// ---------- GET /api/cart ----------------------------------------------------

describe('GET /api/cart', () => {
  test('returns empty items when no cart exists for a guest', async () => {
    const { app } = createTestAppWithPrisma(buildFakePrisma());

    const res = await request(app)
      .get('/api/cart')
      .set('x-guest-token', 'guest-uuid-abc');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  test('returns items when a guest cart exists', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue({
      id: 1,
      items: [
        {
          productId: 1,
          quantity:  2,
          product: { id: 1, name: 'Pikachu Base', price: 25, stockQuantity: 10, imageUrl: null },
        },
      ],
    });
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .get('/api/cart')
      .set('x-guest-token', 'guest-uuid-abc');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].productId).toBe(1);
  });

  test('returns 400 when neither auth header nor x-guest-token is provided', async () => {
    const { app } = createTestAppWithPrisma(buildFakePrisma());

    const res = await request(app).get('/api/cart');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/x-guest-token/);
  });

  test('returns empty items when no cart exists for an authenticated user', async () => {
    const { app, tokenService } = createTestAppWithPrisma(buildFakePrisma());
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });
});

// ---------- POST /api/cart/items ---------------------------------------------

describe('POST /api/cart/items', () => {
  test('returns 400 when productId is missing', async () => {
    const { app } = createTestAppWithPrisma(buildFakePrisma());

    const res = await request(app)
      .post('/api/cart/items')
      .set('x-guest-token', 'g')
      .send({ quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/productId/);
  });

  test('returns 400 when quantity is zero or negative', async () => {
    const { app } = createTestAppWithPrisma(buildFakePrisma());

    const res = await request(app)
      .post('/api/cart/items')
      .set('x-guest-token', 'g')
      .send({ productId: 1, quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/);
  });

  test('returns 404 when the product does not exist', async () => {
    const fake = buildFakePrisma();
    fake.product.findUnique.mockResolvedValue(null);
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .post('/api/cart/items')
      .set('x-guest-token', 'g')
      .send({ productId: 99, quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Product not found');
  });

  test('returns 404 when the product is inactive', async () => {
    const fake = buildFakePrisma();
    fake.product.findUnique.mockResolvedValue({ ...ACTIVE_PRODUCT, isActive: false });
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .post('/api/cart/items')
      .set('x-guest-token', 'g')
      .send({ productId: 1, quantity: 1 });

    expect(res.status).toBe(404);
  });

  test('returns 409 when there is not enough stock', async () => {
    const fake = buildFakePrisma();
    fake.product.findUnique.mockResolvedValue({ ...ACTIVE_PRODUCT, stockQuantity: 2 });
    // existing cart with 2 already in it
    fake.cart.findUnique.mockResolvedValue({ id: 1, items: [{ productId: 1, quantity: 2 }] });
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .post('/api/cart/items')
      .set('x-guest-token', 'g')
      .send({ productId: 1, quantity: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/stock/i);
  });

  test('creates a new cart and adds the item for a guest', async () => {
    const fake = buildFakePrisma();
    fake.product.findUnique.mockResolvedValue(ACTIVE_PRODUCT);
    fake.cart.findUnique.mockResolvedValue(null); // no existing cart — will be created
    fake.cart.create.mockResolvedValue({ id: 1, items: [] });
    fake.cartItem.upsert.mockResolvedValue({ cartId: 1, productId: 1, quantity: 1 });
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .post('/api/cart/items')
      .set('x-guest-token', 'g')
      .send({ productId: 1, quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data.productId).toBe(1);
  });
});

// ---------- PUT /api/cart/items/:productId -----------------------------------

describe('PUT /api/cart/items/:productId', () => {
  test('returns 400 when quantity is negative', async () => {
    const { app } = createTestAppWithPrisma(buildFakePrisma());

    const res = await request(app)
      .put('/api/cart/items/1')
      .set('x-guest-token', 'g')
      .send({ quantity: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/);
  });

  test('removes the item and returns 204 when quantity is 0', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue({ id: 1, items: [{ productId: 1, quantity: 2 }] });
    fake.cartItem.delete.mockResolvedValue({});
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .put('/api/cart/items/1')
      .set('x-guest-token', 'g')
      .send({ quantity: 0 });

    expect(res.status).toBe(204);
  });

  test('updates the quantity and returns the item', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue({ id: 1, items: [{ productId: 1, quantity: 1 }] });
    fake.cartItem.update.mockResolvedValue({ cartId: 1, productId: 1, quantity: 3 });
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .put('/api/cart/items/1')
      .set('x-guest-token', 'g')
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.quantity).toBe(3);
  });
});

// ---------- DELETE /api/cart/items/:productId --------------------------------

describe('DELETE /api/cart/items/:productId', () => {
  test('returns 204 even when cart does not exist', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(null);
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .delete('/api/cart/items/1')
      .set('x-guest-token', 'g');

    expect(res.status).toBe(204);
  });

  test('removes the item when the cart exists', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue({ id: 1 });
    const { app } = createTestAppWithPrisma(fake);

    await request(app).delete('/api/cart/items/1').set('x-guest-token', 'g');

    expect(fake.cartItem.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: 1 }) }),
    );
  });
});

// ---------- DELETE /api/cart -------------------------------------------------

describe('DELETE /api/cart', () => {
  test('returns 204 and clears all items', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue({ id: 1 });
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .delete('/api/cart')
      .set('x-guest-token', 'g');

    expect(res.status).toBe(204);
    expect(fake.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cartId: 1 } });
  });

  test('returns 204 even when no cart exists', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(null);
    const { app } = createTestAppWithPrisma(fake);

    const res = await request(app)
      .delete('/api/cart')
      .set('x-guest-token', 'g');

    expect(res.status).toBe(204);
    expect(fake.cartItem.deleteMany).not.toHaveBeenCalled();
  });
});

// ---------- POST /api/cart/merge ---------------------------------------------

describe('POST /api/cart/merge', () => {
  test('returns 400 when guestToken is missing', async () => {
    const fake = buildFakePrisma();
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/cart/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/guestToken/);
  });

  test('returns { merged: 0 } when the guest cart is empty', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue({ id: 2, items: [] });
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/cart/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ guestToken: 'guest-uuid-abc' });

    expect(res.status).toBe(200);
    expect(res.body.data.merged).toBe(0);
  });

  test('merges guest items into the user cart and returns the count', async () => {
    const fake = buildFakePrisma();
    // Guest cart has 2 items
    fake.cart.findUnique
      .mockResolvedValueOnce({ id: 2, items: [{ productId: 5, quantity: 1 }, { productId: 6, quantity: 3 }] }) // guest cart
      .mockResolvedValueOnce({ id: 1, items: [] }); // user cart
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/cart/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ guestToken: 'guest-uuid-abc' });

    expect(res.status).toBe(200);
    expect(res.body.data.merged).toBe(2);
  });
});
