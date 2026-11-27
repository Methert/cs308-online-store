const { loadConfig } = require('../src/config/env');

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/pokemon_shop',
  JWT_SECRET: 'a'.repeat(32),
  CARD_HMAC_SECRET: 'b'.repeat(32),
};

describe('loadConfig', () => {
  test('applies sensible defaults', () => {
    const config = loadConfig(validEnv);

    expect(config).toMatchObject({
      env: 'development',
      port: 3000,
      bcryptRounds: 10,
      jwt: { expiresIn: '1d' },
      clientOrigins: ['http://localhost:5173'],
      authRateLimit: 20,
    });
  });

  test('fails fast when JWT_SECRET is missing', () => {
    expect(() => loadConfig({ DATABASE_URL: validEnv.DATABASE_URL })).toThrow(
      'JWT_SECRET is required',
    );
  });

  test('rejects a JWT_SECRET shorter than 32 characters (boundary)', () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'a'.repeat(31) })).toThrow(
      'at least 32 characters',
    );
  });

  test('fails fast when DATABASE_URL is missing', () => {
    expect(() => loadConfig({ JWT_SECRET: validEnv.JWT_SECRET })).toThrow(
      'DATABASE_URL is required',
    );
  });

  test('rejects an invalid token lifetime', () => {
    expect(() => loadConfig({ ...validEnv, JWT_EXPIRES_IN: 'one day' })).toThrow('JWT_EXPIRES_IN');
  });

  test('fails fast when CARD_HMAC_SECRET is missing', () => {
    const { CARD_HMAC_SECRET: _, ...withoutSecret } = validEnv;
    expect(() => loadConfig(withoutSecret)).toThrow('CARD_HMAC_SECRET is required');
  });

  test('rejects a CARD_HMAC_SECRET shorter than 32 characters', () => {
    expect(() => loadConfig({ ...validEnv, CARD_HMAC_SECRET: 'b'.repeat(31) })).toThrow(
      'at least 32 characters',
    );
  });

  test('keeps SSL off for the database unless DATABASE_SSL is "true"', () => {
    expect(loadConfig(validEnv).databaseSsl).toBe(false);
    expect(loadConfig({ ...validEnv, DATABASE_SSL: 'true' }).databaseSsl).toBe(true);
  });

  test('rejects a DATABASE_SSL value that is not true or false', () => {
    expect(() => loadConfig({ ...validEnv, DATABASE_SSL: 'yes' })).toThrow('DATABASE_SSL');
  });

  test('converts PORT to a number', () => {
    expect(loadConfig({ ...validEnv, PORT: '8080' }).port).toBe(8080);
  });

  test('splits several frontend origins separated by commas', () => {
    const config = loadConfig({
      ...validEnv,
      CLIENT_ORIGIN: 'http://localhost:5173, https://pokeshop.example',
    });

    expect(config.clientOrigins).toEqual(['http://localhost:5173', 'https://pokeshop.example']);
  });
});
