// Unit tests for the orders API (POST /api/orders, GET, cancel, return).
//
// All Prisma calls are replaced with Jest mock functions so the tests run without a database.
// The invoice service is mocked so PDFKit and nodemailer are never imported during tests.
const crypto  = require('crypto');
const request = require('supertest');
const { createApp }                    = require('../src/app');
const { buildTestConfig, silentLogger } = require('./helpers/testApp');
const { createInMemoryUserRepository } = require('./helpers/inMemoryUserRepository');
const { createTokenService }           = require('../src/utils/tokenService');

// Expose the generateAndSend mock so tests can assert it was called.
// Variables inside jest.mock factories must have names prefixed with "mock".
var mockGenerateAndSend;

jest.mock('../src/services/invoice.service', () => ({
  createInvoiceService: () => {
    mockGenerateAndSend = jest.fn().mockResolvedValue({ id: 1, invoiceNumber: 'INV-TEST-000001' });
    return { generateAndSend: mockGenerateAndSend };
  },
}));

// ---------- helpers ----------------------------------------------------------

function buildFakePrisma() {
  const fake = {
    cart: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    cartItem: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany:   jest.fn().mockResolvedValue([]),
      create:     jest.fn().mockResolvedValue(null),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    payment: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
    invoice: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
    },
    user: {
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
  return { app, tokenService, config };
}

// A cart with one item that has enough stock to be ordered.
const CART_WITH_ITEMS = {
  id: 10,
  items: [
    {
      product: { id: 1, name: 'Charizard Base', price: '100.00', stockQuantity: 5 },
      quantity: 1,
    },
  ],
};

const ORDER_BODY = {
  deliveryAddress: 'Pallet Town, Route 1',
  paymentInfo: {
    cardHolder:  'Ash Ketchum',
    cardNumber:  '4111 1111 1111 1111',
    expiry:      '12/28',
    cvv:         '123',
  },
};

// Order returned after creation (includes items for the invoice service)
const PLACED_ORDER = {
  id: 7,
  userId: 1,
  status: 'processing',
  totalPrice: '100.00',
  deliveryAddress: 'Pallet Town, Route 1',
  createdAt: new Date().toISOString(),
  items: [
    {
      productId: 1,
      quantity:  1,
      unitPrice: '100.00',
      product: { id: 1, name: 'Charizard Base', imageUrl: null },
    },
  ],
};

// ---------- POST /api/orders -------------------------------------------------

describe('POST /api/orders', () => {
  test('returns 401 when the user is not authenticated', async () => {
    const { app } = createTestAppWithPrisma(buildFakePrisma());

    const res = await request(app).post('/api/orders').send(ORDER_BODY);

    expect(res.status).toBe(401);
  });

  test('returns 400 when deliveryAddress is missing', async () => {
    const { app, tokenService } = createTestAppWithPrisma(buildFakePrisma());
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentInfo: ORDER_BODY.paymentInfo });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('deliveryAddress');
  });

  test('returns 400 when paymentInfo is missing', async () => {
    const { app, tokenService } = createTestAppWithPrisma(buildFakePrisma());
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ deliveryAddress: 'Pallet Town' });

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('paymentInfo');
  });

  test('returns 400 when the cart is empty', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue({ id: 10, items: [] });
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(ORDER_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  test('returns 409 when a product runs out of stock during the order', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(CART_WITH_ITEMS);
    // The conditional stock decrement finds 0 eligible rows → out of stock
    fake.$executeRaw.mockResolvedValue(0);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(ORDER_BODY);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/stock/i);
  });

  test('places the order and returns 201 with the new order', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(CART_WITH_ITEMS);
    fake.$executeRaw.mockResolvedValue(1);           // stock decrement succeeds
    fake.order.create.mockResolvedValue(PLACED_ORDER);
    fake.payment.create.mockResolvedValue({ id: 1 });
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(ORDER_BODY);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(PLACED_ORDER.id);
    expect(res.body.data.status).toBe('processing');
  });

  test('stores a payment record with last-4 digits and an HMAC', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(CART_WITH_ITEMS);
    fake.$executeRaw.mockResolvedValue(1);
    fake.order.create.mockResolvedValue(PLACED_ORDER);
    const { app, tokenService, config } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(ORDER_BODY);

    expect(fake.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cardLast4: '1111',         // last 4 of "4111 1111 1111 1111"
          cardHolder: 'Ash Ketchum',
          cardHash: expect.any(String),
        }),
      }),
    );
    // The full card number must NOT be stored
    const callArg = fake.payment.create.mock.calls[0][0].data;
    expect(callArg).not.toHaveProperty('cardNumber');

    // The hash must be HMAC-SHA256, not plain SHA-256
    const plainHash = crypto.createHash('sha256').update('4111111111111111').digest('hex');
    expect(callArg.cardHash).not.toBe(plainHash);
    const expectedHmac = crypto.createHmac('sha256', config.cardHmacSecret)
      .update('4111111111111111').digest('hex');
    expect(callArg.cardHash).toBe(expectedHmac);
  });
});

// ---------- POST /api/orders (mock bank) ------------------------------------

describe('POST /api/orders mock bank', () => {
  test('returns 402 when the card is on the decline list (generic decline)', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(CART_WITH_ITEMS);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...ORDER_BODY,
        paymentInfo: { ...ORDER_BODY.paymentInfo, cardNumber: '4000 0000 0000 0002' },
      });

    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/declined/i);
  });

  test('returns 402 with insufficient funds message for the funds test card', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(CART_WITH_ITEMS);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...ORDER_BODY,
        paymentInfo: { ...ORDER_BODY.paymentInfo, cardNumber: '4000 0000 0000 9995' },
      });

    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/funds/i);
  });

  test('approves the standard test card (4242 4242 4242 4242)', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(CART_WITH_ITEMS);
    fake.$executeRaw.mockResolvedValue(1);
    fake.order.create.mockResolvedValue(PLACED_ORDER);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...ORDER_BODY,
        paymentInfo: { ...ORDER_BODY.paymentInfo, cardNumber: '4242 4242 4242 4242' },
      });

    expect(res.status).toBe(201);
  });
});

// ---------- POST /api/orders (invoice) ---------------------------------------

describe('POST /api/orders invoice', () => {
  test('calls the invoice service with the placed order', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(CART_WITH_ITEMS);
    fake.$executeRaw.mockResolvedValue(1);
    fake.order.create.mockResolvedValue(PLACED_ORDER);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(ORDER_BODY);

    // Let the fire-and-forget promise settle before asserting.
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockGenerateAndSend).toHaveBeenCalledTimes(1);
    expect(mockGenerateAndSend).toHaveBeenCalledWith(
      expect.objectContaining({ id: PLACED_ORDER.id }),
    );
  });

  test('a failure in the invoice service does not affect the 201 response', async () => {
    const fake = buildFakePrisma();
    fake.cart.findUnique.mockResolvedValue(CART_WITH_ITEMS);
    fake.$executeRaw.mockResolvedValue(1);
    fake.order.create.mockResolvedValue(PLACED_ORDER);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    // Make the invoice service throw to verify it does not break the order response.
    mockGenerateAndSend.mockRejectedValueOnce(new Error('PDF disk full'));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(ORDER_BODY);

    expect(res.status).toBe(201);
  });
});

// ---------- GET /api/orders --------------------------------------------------

describe('GET /api/orders', () => {
  test('returns 401 when the user is not authenticated', async () => {
    const { app } = createTestAppWithPrisma(buildFakePrisma());

    const res = await request(app).get('/api/orders');

    expect(res.status).toBe(401);
  });

  test('returns the list of orders for the authenticated user', async () => {
    const fake = buildFakePrisma();
    fake.order.findMany.mockResolvedValue([PLACED_ORDER]);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.orders[0].id).toBe(PLACED_ORDER.id);
  });
});

// ---------- GET /api/orders/:id ----------------------------------------------

describe('GET /api/orders/:id', () => {
  test('returns 400 for a non-numeric order ID', async () => {
    const { app, tokenService } = createTestAppWithPrisma(buildFakePrisma());
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/api/orders/not-a-number')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Order id must be a positive whole number');
  });

  test('returns 404 when the order does not exist', async () => {
    const fake = buildFakePrisma();
    fake.order.findUnique.mockResolvedValue(null);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/api/orders/999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });

  test('returns 404 when the order belongs to a different user', async () => {
    const fake = buildFakePrisma();
    fake.order.findUnique.mockResolvedValue({ ...PLACED_ORDER, userId: 99 }); // different user
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' }); // user id 1

    const res = await request(app)
      .get('/api/orders/7')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('returns the order when it belongs to the requesting user', async () => {
    const fake = buildFakePrisma();
    fake.order.findUnique.mockResolvedValue(PLACED_ORDER);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .get('/api/orders/7')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PLACED_ORDER.id);
  });
});

// ---------- PUT /api/orders/:id/cancel ---------------------------------------

describe('PUT /api/orders/:id/cancel', () => {
  test('returns 400 for a non-numeric order ID', async () => {
    const { app, tokenService } = createTestAppWithPrisma(buildFakePrisma());
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .put('/api/orders/abc/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Order id must be a positive whole number');
  });

  test('returns 404 when the order does not exist', async () => {
    const fake = buildFakePrisma();
    // Conditional UPDATE touches 0 rows → disambiguation query finds no order
    fake.$executeRaw.mockResolvedValue(0);
    fake.order.findUnique.mockResolvedValue(null);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .put('/api/orders/7/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Order not found');
  });

  test('returns 409 when the order is no longer in processing status (race condition)', async () => {
    const fake = buildFakePrisma();
    // 0 rows updated because status already changed (concurrent cancel or delivery)
    fake.$executeRaw.mockResolvedValue(0);
    // The order exists and belongs to the user but is now cancelled
    fake.order.findUnique.mockResolvedValue({ id: 7, userId: 1, status: 'cancelled', items: [] });
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .put('/api/orders/7/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/processing/);
  });

  test('cancels the order and restores stock', async () => {
    const fake = buildFakePrisma();
    // First $executeRaw: conditional status update (1 row affected)
    fake.$executeRaw
      .mockResolvedValueOnce(1)   // UPDATE orders SET status = 'cancelled'
      .mockResolvedValue(undefined); // UPDATE products SET stock_quantity = ...
    fake.orderItem.findMany.mockResolvedValue([{ productId: 1, quantity: 2 }]);
    fake.order.findUnique.mockResolvedValue({ ...PLACED_ORDER, status: 'cancelled' });
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .put('/api/orders/7/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    // Stock was restored for the one item
    expect(fake.$executeRaw).toHaveBeenCalledTimes(2);
  });
});

// ---------- POST /api/orders/:id/return --------------------------------------

describe('POST /api/orders/:id/return', () => {
  test('returns 400 for a non-numeric order ID', async () => {
    const { app, tokenService } = createTestAppWithPrisma(buildFakePrisma());
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders/xyz/return')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Order id must be a positive whole number');
  });

  test('returns 404 when the order does not exist', async () => {
    const fake = buildFakePrisma();
    fake.order.findUnique.mockResolvedValue(null);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders/7/return')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong card' });

    expect(res.status).toBe(404);
  });

  test('returns 409 when the order is not delivered', async () => {
    const fake = buildFakePrisma();
    fake.order.findUnique.mockResolvedValue({ id: 7, userId: 1, status: 'processing' });
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders/7/return')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong card' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/delivered/);
  });

  test('returns 409 when the 30-day return window has passed', async () => {
    const fake = buildFakePrisma();
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    fake.order.findUnique.mockResolvedValue({
      id: 7, userId: 1, status: 'delivered', createdAt: oldDate,
    });
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders/7/return')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong card' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/30 days/);
  });

  test('accepts a return request for a delivered order within 30 days', async () => {
    const fake = buildFakePrisma();
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    fake.order.findUnique.mockResolvedValue({
      id: 7, userId: 1, status: 'delivered', createdAt: recentDate,
    });
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders/7/return')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Card is damaged' });

    expect(res.status).toBe(202);
    expect(res.body.data.message).toMatch(/return request received/i);
  });

  test('stores a return_requests row for each order item', async () => {
    const fake = buildFakePrisma();
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    fake.order.findUnique.mockResolvedValue({
      id: 7, userId: 1, status: 'delivered', createdAt: recentDate,
    });
    fake.orderItem.findMany.mockResolvedValue([
      { id: 11, productId: 1, quantity: 2, unitPrice: '100.00' },
      { id: 12, productId: 2, quantity: 1, unitPrice: '50.00' },
    ]);
    const { app, tokenService } = createTestAppWithPrisma(fake);
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const res = await request(app)
      .post('/api/orders/7/return')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Wrong card' });

    expect(res.status).toBe(202);
    // One INSERT per order item (2 items → 2 calls)
    expect(fake.$executeRaw).toHaveBeenCalledTimes(2);
    // The SQL must be an INSERT into return_requests
    const [strings] = fake.$executeRaw.mock.calls[0];
    expect(strings[0].toLowerCase()).toContain('insert into return_requests');
  });
});
