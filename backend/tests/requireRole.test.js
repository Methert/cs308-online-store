// We test the role check in a small app built only for this test.
const express = require('express');
const request = require('supertest');
const { requireRole } = require('../src/middleware/requireRole');
const { createAuthMiddleware } = require('../src/middleware/authenticate');
const { createErrorHandler } = require('../src/middleware/errorHandler');
const { createTokenService } = require('../src/utils/tokenService');
const { ROLES } = require('../src/constants/roles');
const { TEST_SECRET, silentLogger } = require('./helpers/testApp');

const tokenService = createTokenService({ secret: TEST_SECRET, expiresIn: '1h' });
const { authenticate, optionalAuthenticate } = createAuthMiddleware(tokenService);

function buildApp() {
  const app = express();
  app.get('/pm-only', authenticate, requireRole(ROLES.PRODUCT_MANAGER), (req, res) =>
    res.json({ data: 'ok' }),
  );
  app.get(
    '/managers',
    authenticate,
    requireRole(ROLES.PRODUCT_MANAGER, ROLES.SALES_MANAGER),
    (req, res) => res.json({ data: 'ok' }),
  );
  app.get('/no-auth-before', requireRole(ROLES.CUSTOMER), (req, res) => res.json({ data: 'ok' }));
  app.get('/guest-allowed', optionalAuthenticate, (req, res) =>
    res.json({ data: { user: req.user } }),
  );
  app.use(createErrorHandler({ logger: silentLogger }));
  return app;
}

const tokenFor = (role) => `Bearer ${tokenService.sign({ id: 1, role })}`;

describe('requireRole', () => {
  test('lets a product manager into a product-manager-only route', async () => {
    const res = await request(buildApp())
      .get('/pm-only')
      .set('Authorization', tokenFor(ROLES.PRODUCT_MANAGER));

    expect(res.status).toBe(200);
  });

  test.each([ROLES.CUSTOMER, ROLES.SALES_MANAGER, ROLES.SUPPORT_AGENT])(
    'blocks %s from a product-manager-only route with 403',
    async (role) => {
      const res = await request(buildApp()).get('/pm-only').set('Authorization', tokenFor(role));

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You do not have permission to perform this action');
    },
  );

  test('allows any of several listed roles', async () => {
    const res = await request(buildApp())
      .get('/managers')
      .set('Authorization', tokenFor(ROLES.SALES_MANAGER));

    expect(res.status).toBe(200);
  });

  test('returns 401 instead of 403 when nobody is logged in', async () => {
    const res = await request(buildApp()).get('/pm-only');

    expect(res.status).toBe(401);
  });

  test('returns 401 if used without authenticate before it', async () => {
    const res = await request(buildApp()).get('/no-auth-before');

    expect(res.status).toBe(401);
  });

  test('throws immediately for a misspelled role name', () => {
    expect(() => requireRole('product-manager')).toThrow('Unknown role');
  });

  test('throws immediately when no role is given', () => {
    expect(() => requireRole()).toThrow('at least one role');
  });
});

describe('optionalAuthenticate', () => {
  test('lets a guest through with req.user = null', async () => {
    const res = await request(buildApp()).get('/guest-allowed');

    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeNull();
  });

  test('attaches the user when a valid token is sent', async () => {
    const res = await request(buildApp())
      .get('/guest-allowed')
      .set('Authorization', tokenFor(ROLES.CUSTOMER));

    expect(res.body.data.user).toEqual({ id: 1, role: 'customer' });
  });

  test('returns 401 for an invalid token instead of silently treating it as a guest', async () => {
    const res = await request(buildApp())
      .get('/guest-allowed')
      .set('Authorization', 'Bearer broken');

    expect(res.status).toBe(401);
  });
});
