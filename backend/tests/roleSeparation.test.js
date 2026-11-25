// Role separation (requirements 10 and 17): every manager route is tried with every role.
//   - no token           -> 401
//   - a role not allowed -> 403
//   - an allowed role    -> gets past the role check (any answer except 401/403)
//
// When you add a new manager route, add it to MANAGER_ROUTES below.
const request = require('supertest');
const { createTestApp, TEST_SECRET } = require('./helpers/testApp');
const { createTokenService } = require('../src/utils/tokenService');
const { ROLES, ALL_ROLES } = require('../src/constants/roles');

const PM = ROLES.PRODUCT_MANAGER;
const SM = ROLES.SALES_MANAGER;

// [method, url, roles that may use it]
const MANAGER_ROUTES = [
  // Products and stock (Sprint 4)
  ['get', '/api/products/manage', [PM, SM]],
  ['get', '/api/products/manage/1', [PM, SM]],
  ['post', '/api/products', [PM]],
  ['patch', '/api/products/1', [PM]],
  ['delete', '/api/products/1', [PM]],
  ['patch', '/api/products/1/stock', [PM]],
  // Categories (Sprint 4)
  ['post', '/api/categories', [PM]],
  ['patch', '/api/categories/1', [PM]],
  ['delete', '/api/categories/1', [PM]],
  // Deliveries and order status (Sprint 5)
  ['get', '/api/deliveries', [PM]],
  ['patch', '/api/orders/1/status', [PM]],
];

// Every (route, role) pair, so each one shows up as its own test line.
const CASES = [];
for (const [method, url, allowed] of MANAGER_ROUTES) {
  for (const role of ALL_ROLES) {
    CASES.push([method.toUpperCase(), url, role, allowed.includes(role)]);
  }
}

function send(app, method, url, auth) {
  const req = request(app)[method.toLowerCase()](url);
  if (auth) req.set('Authorization', auth);
  return req.send({});
}

describe('manager routes need a login', () => {
  test.each(MANAGER_ROUTES)('%s %s without a token gives 401', async (method, url) => {
    const { app } = createTestApp();

    const res = await send(app, method, url, null);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
  });
});

describe('manager routes check the role', () => {
  test.each(CASES)('%s %s as %s (allowed: %s)', async (method, url, role, allowed) => {
    const { app, bearerFor } = createTestApp();

    const res = await send(app, method, url, bearerFor(role));

    if (allowed) {
      expect([401, 403]).not.toContain(res.status);
    } else {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'You do not have permission to perform this action' });
    }
  });
});

describe('tokens that cannot be trusted', () => {
  test('a token signed with another secret gives 401', async () => {
    const { app } = createTestApp();
    const other = createTestApp({ config: { jwt: { secret: 'x'.repeat(40), expiresIn: '1h' } } });

    const res = await send(app, 'get', '/api/deliveries', other.bearerFor(PM));

    expect(res.status).toBe(401);
  });

  test('an expired token gives 401 with a clear message', async () => {
    const { app } = createTestApp();
    // Same secret as the app, but the token expired one second ago.
    const token = createTokenService({ secret: TEST_SECRET, expiresIn: '-1s' }).sign({
      id: 1,
      role: PM,
    });

    const res = await send(app, 'get', '/api/deliveries', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Session expired, please log in again' });
  });

  test('a customer token with the role changed by hand gives 401', async () => {
    const { app, bearerFor } = createTestApp();
    const [header, payload, signature] = bearerFor(ROLES.CUSTOMER).slice(7).split('.');
    const fakePayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), role: PM }),
    ).toString('base64url');

    const res = await send(
      app,
      'patch',
      '/api/orders/1/status',
      `Bearer ${header}.${fakePayload}.${signature}`,
    );

    expect(res.status).toBe(401);
  });

  test('a role written in the request body is ignored', async () => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', bearerFor(ROLES.CUSTOMER))
      .send({ role: PM });

    expect(res.status).toBe(403);
  });
});

describe('the role check comes before anything else', () => {
  test('a customer with an invalid body gets 403, not 400', async () => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      .patch('/api/orders/abc/status')
      .set('Authorization', bearerFor(ROLES.CUSTOMER))
      .send({ status: 'nonsense' });

    expect(res.status).toBe(403);
  });

  test('a customer cannot learn whether an order exists (403 for a missing one too)', async () => {
    const { app, bearerFor } = createTestApp();

    const res = await request(app)
      .patch('/api/orders/999/status')
      .set('Authorization', bearerFor(ROLES.CUSTOMER))
      .send({ status: 'in_transit' });

    expect(res.status).toBe(403);
  });
});

describe('shop pages stay open to everyone', () => {
  test.each(['/api/products', '/api/categories', '/api/products/1', '/api/categories/1/products'])(
    'GET %s works without a token',
    async (url) => {
      const { app } = createTestApp();

      const res = await request(app).get(url);

      expect([401, 403]).not.toContain(res.status);
    },
  );
});
