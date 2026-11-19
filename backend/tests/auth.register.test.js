const request = require('supertest');
const { createTestApp, validRegistration } = require('./helpers/testApp');

describe('POST /api/auth/register', () => {
  test('creates a customer and returns 201 with user and token', async () => {
    const { app } = createTestApp();

    const res = await request(app).post('/api/auth/register').send(validRegistration());

    expect(res.status).toBe(201);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      id: 1,
      name: 'Ash Ketchum',
      email: 'ash@pokeshop.test',
      role: 'customer',
      taxId: '12345678901',
      homeAddress: 'Pallet Town, Route 1, No: 5',
    });
  });

  test('never returns the password or its hash', async () => {
    const { app } = createTestApp();

    const res = await request(app).post('/api/auth/register').send(validRegistration());

    expect(res.body.data.user).not.toHaveProperty('password');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
  });

  test('stores a bcrypt hash instead of the plain password', async () => {
    const { app, userRepository } = createTestApp();

    await request(app).post('/api/auth/register').send(validRegistration());

    const stored = userRepository.users[0];
    expect(stored.passwordHash).not.toBe('Pikachu123');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('ignores a role sent by the client and always creates a customer', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ role: 'sales_manager' }));

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('customer');
  });

  test('normalizes email to lowercase and trims spaces', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ email: '  Ash@PokeShop.TEST ' }));

    expect(res.body.data.user.email).toBe('ash@pokeshop.test');
  });

  test('rejects an email that is already registered with 409', async () => {
    const { app } = createTestApp();
    await request(app).post('/api/auth/register').send(validRegistration());

    const res = await request(app).post('/api/auth/register').send(validRegistration());

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email is already registered');
  });

  test('treats emails that differ only in letter case as duplicates', async () => {
    const { app } = createTestApp();
    await request(app).post('/api/auth/register').send(validRegistration());

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ email: 'ASH@pokeshop.test' }));

    expect(res.status).toBe(409);
  });

  test('returns 400 with a list of every missing field', async () => {
    const { app } = createTestApp();

    const res = await request(app).post('/api/auth/register').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    const fields = res.body.details.map((d) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining(['name', 'email', 'password', 'taxId', 'homeAddress']),
    );
  });

  test.each([
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['a 7 character password (boundary)', { password: 'Pika123' }, 'password'],
    ['a password without digits', { password: 'Pikachuuu' }, 'password'],
    ['a password without letters', { password: '12345678' }, 'password'],
    ['a tax id with letters', { taxId: '12345ABC901' }, 'taxId'],
    ['a 9 digit tax id (boundary)', { taxId: '123456789' }, 'taxId'],
    ['a 12 digit tax id (boundary)', { taxId: '123456789012' }, 'taxId'],
    ['a 1 character name (boundary)', { name: 'A' }, 'name'],
    ['a name that is only spaces', { name: '     ' }, 'name'],
    ['a too short address', { homeAddress: 'abc' }, 'homeAddress'],
  ])('rejects %s with 400', async (_label, override, field) => {
    const { app } = createTestApp();

    const res = await request(app).post('/api/auth/register').send(validRegistration(override));

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain(field);
  });

  test('accepts an 8 character password (lower boundary)', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ password: 'Pikach12' }));

    expect(res.status).toBe(201);
  });

  test('accepts 10 digit tax numbers as well as 11 digit ones', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ taxId: '1234567890' }));

    expect(res.status).toBe(201);
  });

  test('rejects a password longer than 72 bytes (bcrypt limit)', async () => {
    const { app } = createTestApp();
    // "ş" takes 2 bytes: 36 characters = 72 bytes (at the limit), 37 characters = 74 bytes
    const tooLong = 'ş'.repeat(36) + '1';

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ password: tooLong }));

    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toBe('Password is too long');
  });

  test('does not save anything when validation fails', async () => {
    const { app, userRepository } = createTestApp();

    await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ email: 'bad' }));

    expect(userRepository.users).toHaveLength(0);
  });
});
