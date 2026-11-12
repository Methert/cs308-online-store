const request = require('supertest');
const { createTestApp, validRegistration } = require('./helpers/testApp');

async function registerAsh(app) {
  await request(app).post('/api/auth/register').send(validRegistration());
}

describe('POST /api/auth/login', () => {
  test('returns 200 with user and token for correct credentials', async () => {
    const { app } = createTestApp();
    await registerAsh(app);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ash@pokeshop.test', password: 'Pikachu123' });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe('ash@pokeshop.test');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  test('accepts the email with different letter case and spaces', async () => {
    const { app } = createTestApp();
    await registerAsh(app);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  ASH@PokeShop.test ', password: 'Pikachu123' });

    expect(res.status).toBe(200);
  });

  test('returns 401 for a wrong password', async () => {
    const { app } = createTestApp();
    await registerAsh(app);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ash@pokeshop.test', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('passwords are case sensitive', async () => {
    const { app } = createTestApp();
    await registerAsh(app);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ash@pokeshop.test', password: 'pikachu123' });

    expect(res.status).toBe(401);
  });

  test('returns the same 401 message for an unknown email', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@pokeshop.test', password: 'Pikachu123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  test('returns 400 when email or password is missing', async () => {
    const { app } = createTestApp();

    const res = await request(app).post('/api/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toEqual(['email', 'password']);
  });

  test('returns 400 for an empty password', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ash@pokeshop.test', password: '' });

    expect(res.status).toBe(400);
  });

  test('returns a token that works on /me', async () => {
    const { app } = createTestApp();
    await registerAsh(app);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ash@pokeshop.test', password: 'Pikachu123' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Ash Ketchum');
  });
});
