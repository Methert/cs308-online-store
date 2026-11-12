const jwt = require('jsonwebtoken');
const { createTokenService } = require('../src/utils/tokenService');
const { TEST_SECRET } = require('./helpers/testApp');

describe('tokenService', () => {
  const tokenService = createTokenService({ secret: TEST_SECRET, expiresIn: '1h' });

  test('a signed token verifies back to the same id and role', () => {
    const token = tokenService.sign({ id: 42, role: 'sales_manager' });

    expect(tokenService.verify(token)).toEqual({ id: 42, role: 'sales_manager' });
  });

  test('puts no personal data into the token', () => {
    const token = tokenService.sign({
      id: 7,
      role: 'customer',
      email: 'ash@pokeshop.test',
      passwordHash: 'secret-hash',
    });

    const payload = jwt.decode(token);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
  });

  test('sets the expiry from the configuration', () => {
    const token = tokenService.sign({ id: 1, role: 'customer' });

    const { iat, exp } = jwt.decode(token);
    expect(exp - iat).toBe(3600);
  });

  test('rejects a token whose role was changed by the client', () => {
    const token = tokenService.sign({ id: 1, role: 'customer' });
    const [header, , signature] = token.split('.');
    const fakePayload = Buffer.from(JSON.stringify({ sub: '1', role: 'sales_manager' })).toString(
      'base64url',
    );

    expect(() => tokenService.verify(`${header}.${fakePayload}.${signature}`)).toThrow();
  });

  test('rejects a correctly signed token with an unknown role', () => {
    const token = jwt.sign({ role: 'admin' }, TEST_SECRET, { subject: '1' });

    expect(() => tokenService.verify(token)).toThrow('Malformed token payload');
  });

  test('rejects a correctly signed token with a non-numeric subject', () => {
    const token = jwt.sign({ role: 'customer' }, TEST_SECRET, { subject: 'abc' });

    expect(() => tokenService.verify(token)).toThrow('Malformed token payload');
  });

  test('rejects tokens that use the "none" algorithm', () => {
    const unsigned = jwt.sign({ role: 'customer' }, null, { subject: '1', algorithm: 'none' });

    expect(() => tokenService.verify(unsigned)).toThrow();
  });

  test('cannot be created without a secret', () => {
    expect(() => createTokenService({ secret: '', expiresIn: '1h' })).toThrow();
  });
});
