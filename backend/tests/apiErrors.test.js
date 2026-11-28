// Every error has the same shape:  { "error": "message" }  (+ "details" for validation errors)
// and bad input from the client never becomes a 500.
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const { createErrorHandler } = require('../src/middleware/errorHandler');
const { AppError } = require('../src/utils/AppError');
const { ROLES } = require('../src/constants/roles');

// Only { error } or { error, details } is allowed in an error answer.
function expectErrorShape(res) {
  expect(typeof res.body.error).toBe('string');
  expect(Object.keys(res.body).every((key) => key === 'error' || key === 'details')).toBe(true);
}

describe('the same error shape everywhere', () => {
  test('an unknown URL gives 404 in the usual form', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found: GET /api/does-not-exist' });
  });

  test('a wrong method on a known URL gives 404 too', async () => {
    const { app } = createTestApp();

    const res = await request(app).put('/api/deliveries');

    expect(res.status).toBe(404);
    expectErrorShape(res);
  });

  test('broken JSON gives 400', async () => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER))
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Request body is not valid JSON' });
  });

  test('a body over 100 kB gives 413', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'x'.repeat(200 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Request body is too large' });
  });

  test('validation errors list every wrong field', async () => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER))
      .send({ name: '', releaseDate: 'yesterday' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.map((d) => d.field).sort()).toEqual(['name', 'releaseDate']);
  });

  test.each([
    ['get', '/api/products/abc', 'Product id must be a positive whole number'],
    ['get', '/api/categories/abc', 'Category id must be a positive whole number'],
    ['patch', '/api/orders/abc/status', 'Order id must be a positive whole number'],
  ])('%s %s: every id is checked with the same rule and message', async (method, url, message) => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      [method](url)
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER))
      .send({ status: 'in_transit' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
  });
});

describe('requests without a JSON body get 400, not 500', () => {
  test('a manager route with no body', async () => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      .patch('/api/orders/1/status')
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('a body sent as plain text is treated as empty', async () => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', bearerFor(ROLES.PRODUCT_MANAGER))
      .set('Content-Type', 'text/plain')
      .send('name=Base Set');

    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('name');
  });

  // Before the empty-body fix in app.js, the cart and order routes crashed here with
  // "Cannot destructure property of undefined" (500).
  test.each([
    ['post', '/api/orders', 'deliveryAddress'],
    ['post', '/api/cart/items', 'productId'],
    ['put', '/api/cart/items/1', 'quantity'],
    ['post', '/api/cart/merge', 'guestToken'],
    ['post', '/api/auth/login', 'email'],
  ])('%s %s with no body answers 400 and names the missing field', async (method, url, field) => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)[method](url).set('Authorization', bearerFor(ROLES.CUSTOMER));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.map((d) => d.field)).toContain(field);
  });

  test.each([
    ['get', '/api/orders/abc', 'Order id must be a positive whole number'],
    ['get', '/api/orders/2147483648', 'Order id must be a positive whole number'],
    ['put', '/api/orders/1e3/cancel', 'Order id must be a positive whole number'],
    ['delete', '/api/cart/items/abc', 'Product id must be a positive whole number'],
    ['put', '/api/cart/items/-1', 'Product id must be a positive whole number'],
  ])('%s %s: cart and order ids use the same rule as every route', async (method, url, message) => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      [method](url)
      .set('Authorization', bearerFor(ROLES.CUSTOMER))
      .send({ quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
  });

  test('an order with a wrong card number is refused before anything is saved', async () => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearerFor(ROLES.CUSTOMER))
      .send({
        deliveryAddress: 'Pallet Town, Route 1',
        paymentInfo: { cardHolder: 'Ash Ketchum', cardNumber: '1234' },
      });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([
      {
        field: 'paymentInfo.cardNumber',
        message: 'paymentInfo.cardNumber must be 12 to 19 digits',
      },
    ]);
  });
});

describe('errorHandler', () => {
  // Runs the error handler on one error and returns what it answered.
  function handle(err, logger = { error: jest.fn(), warn: jest.fn() }) {
    const res = {
      headersSent: false,
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    const next = jest.fn();
    createErrorHandler({ logger })(err, { method: 'GET', originalUrl: '/x' }, res, next);
    return { res, next, logger };
  }

  const prismaError = (code, meta) => Object.assign(new Error('db'), { code, meta });

  test('an AppError keeps its status, message and details', () => {
    const { res } = handle(new AppError(409, 'Not enough stock', [{ field: 'a' }]));

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Not enough stock', details: [{ field: 'a' }] });
  });

  test('a record that was not found in the database gives 404', () => {
    const { res } = handle(prismaError('P2025'));

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  test('a number too large for the database gives 400 (P2020)', () => {
    const { res } = handle(prismaError('P2020'));

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'A number in the request is too large' });
  });

  test('a number too large in a raw SQL query gives 400 (PostgreSQL 22003)', () => {
    const err = prismaError('P2010', { driverAdapterError: { cause: { originalCode: '22003' } } });

    const { res } = handle(err);

    expect(res.statusCode).toBe(400);
  });

  test('a value of the wrong type gives 400 and is logged as a warning', () => {
    const err = Object.assign(new Error('Argument id: Invalid value'), {
      name: 'PrismaClientValidationError',
    });

    const { res, logger } = handle(err);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid value in the request' });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('an Express client error with a safe message keeps its status', () => {
    const err = Object.assign(new Error('unsupported charset "UTF-7"'), {
      status: 415,
      expose: true,
    });

    const { res } = handle(err);

    expect(res.statusCode).toBe(415);
    expect(res.body).toEqual({ error: 'unsupported charset "UTF-7"' });
  });

  test('an unexpected error gives 500 without leaking details, and is logged', () => {
    const err = new Error('password=secret at line 42');

    const { res, logger } = handle(err);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(logger.error).toHaveBeenCalledWith(err);
  });

  test('another database error still gives 500', () => {
    const { res } = handle(prismaError('P1001'));

    expect(res.statusCode).toBe(500);
  });

  test('if the answer was already sent, the error is passed on to Express', () => {
    const err = new Error('late');
    const logger = { error: jest.fn(), warn: jest.fn() };
    const res = { headersSent: true };
    const next = jest.fn();

    createErrorHandler({ logger })(err, {}, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });
});
