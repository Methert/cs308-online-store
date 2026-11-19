const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createTestApp, insertUser, TEST_SECRET } = require('./helpers/testApp');

describe('GET /api/auth/me', () => {
  test('returns the profile fields required by the profile page', async () => {
    const { app, userRepository, tokenService } = createTestApp();
    const user = await insertUser(userRepository, {
      name: 'Misty',
      homeAddress: 'Cerulean City Gym',
      taxId: '1234567890',
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenService.sign(user)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      id: user.id,
      name: 'Misty',
      email: user.email,
      homeAddress: 'Cerulean City Gym',
      role: 'customer',
    });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  test('returns 401 without an Authorization header', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  test('returns 401 when the header is not a Bearer token', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/auth/me').set('Authorization', 'Basic abc123');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid authentication token');
  });

  test('accepts the "bearer" keyword in lowercase', async () => {
    const { app, userRepository, tokenService } = createTestApp();
    const user = await insertUser(userRepository);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `bearer ${tokenService.sign(user)}`);

    expect(res.status).toBe(200);
  });

  test('returns 401 for a random string as token', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid authentication token');
  });

  test('returns 401 for a token signed with another secret', async () => {
    const { app, userRepository } = createTestApp();
    const user = await insertUser(userRepository);
    const forged = jwt.sign({ role: 'customer' }, 'some-other-secret-of-sufficient-length!!', {
      subject: String(user.id),
    });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  test('returns 401 with a clear message for an expired token', async () => {
    const { app, userRepository } = createTestApp();
    const user = await insertUser(userRepository);
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const expired = jwt.sign(
      { role: 'customer', iat: oneHourAgo - 60, exp: oneHourAgo },
      TEST_SECRET,
      { subject: String(user.id) },
    );

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Session expired, please log in again');
  });

  test('returns 401 when the account behind a valid token no longer exists', async () => {
    const { app, tokenService } = createTestApp();
    const token = tokenService.sign({ id: 999, role: 'customer' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('User no longer exists');
  });
});
