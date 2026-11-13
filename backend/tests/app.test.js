// Behavior of the whole app: health check, 404, malformed JSON, security, rate limiting.
const request = require('supertest');
const { createApp } = require('../src/app');
const { createTestApp, buildTestConfig, validRegistration } = require('./helpers/testApp');

describe('GET /api/health', () => {
  test('returns ok when the database answers', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', database: 'up' } });
  });

  test('returns 503 when the database is down', async () => {
    const { app } = createTestApp({
      checkDatabase: async () => {
        throw new Error('connection refused');
      },
    });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Database is unavailable');
  });
});

describe('error handling', () => {
  test('returns JSON 404 for an unknown route', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Route not found: GET /api/does-not-exist');
  });

  test('returns 400 for a malformed JSON body', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "ash@pokeshop.test",');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Request body is not valid JSON');
  });

  test('returns 400 (not 500) when the body is not JSON at all', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send('hello');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  test('returns 413 for a body larger than 100kb', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegistration({ homeAddress: 'x'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
  });

  test('hides internal error details behind a generic 500', async () => {
    const errors = [];
    // A broken repository: imitates an unexpected database error.
    const brokenRepository = {
      findByEmail: async () => {
        throw new Error('secret db detail');
      },
    };
    const brokenApp = createApp({
      config: buildTestConfig(),
      userRepository: brokenRepository,
      checkDatabase: async () => {},
      logger: { error: (e) => errors.push(e) },
    });

    const res = await request(brokenApp)
      .post('/api/auth/login')
      .send({ email: 'ash@pokeshop.test', password: 'Pikachu123' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(errors[0].message).toBe('secret db detail');
  });
});

describe('security headers and CORS', () => {
  test('does not reveal that the server uses Express', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('allows requests from the configured frontend origin', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('does not allow requests from other origins', async () => {
    const { app } = createTestApp();

    const res = await request(app).get('/api/health').set('Origin', 'http://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  test('blocks too many login attempts from the same IP with 429', async () => {
    const { app } = createTestApp({ config: { authRateLimit: 3 } });
    const attempt = () =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'ash@pokeshop.test', password: 'Wrong123' });

    await attempt();
    await attempt();
    await attempt();
    const res = await attempt();

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many attempts, please try again later');
  });
});
