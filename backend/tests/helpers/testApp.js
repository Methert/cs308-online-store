// Every test builds its own clean app and an empty fake database (tests are independent).
const bcrypt = require('bcryptjs');
const { createApp } = require('../../src/app');
const { createTokenService } = require('../../src/utils/tokenService');
const { createInMemoryUserRepository } = require('./inMemoryUserRepository');

const TEST_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';

function buildTestConfig(overrides = {}) {
  return {
    env: 'test',
    port: 0,
    databaseUrl: 'postgresql://unused',
    jwt: { secret: TEST_SECRET, expiresIn: '1h' },
    bcryptRounds: 4, // low to keep tests fast; use 10+ in real environments
    clientOrigins: ['http://localhost:5173'],
    authRateLimit: 1000,
    ...overrides,
  };
}

const silentLogger = { error() {}, warn() {}, info() {}, log() {} };

function createTestApp({ config: configOverrides, checkDatabase, logger } = {}) {
  const config = buildTestConfig(configOverrides);
  const userRepository = createInMemoryUserRepository();
  const app = createApp({
    config,
    userRepository,
    checkDatabase: checkDatabase ?? (async () => {}),
    logger: logger ?? silentLogger,
  });
  const tokenService = createTokenService(config.jwt);
  return { app, config, userRepository, tokenService };
}

// Valid example data for the registration form. A test only writes the field it changes.
function validRegistration(overrides = {}) {
  return {
    name: 'Ash Ketchum',
    email: 'ash@pokeshop.test',
    password: 'Pikachu123',
    taxId: '12345678901',
    homeAddress: 'Pallet Town, Route 1, No: 5',
    ...overrides,
  };
}

// Adds a user with the wanted role (e.g. product_manager) directly to the fake database.
async function insertUser(
  userRepository,
  { role = 'customer', password = 'Password123', ...rest } = {},
) {
  return userRepository.create({
    name: 'Test User',
    email: `${role}-${userRepository.users.length + 1}@pokeshop.test`,
    passwordHash: await bcrypt.hash(password, 4),
    role,
    ...rest,
  });
}

module.exports = {
  TEST_SECRET,
  buildTestConfig,
  silentLogger,
  createTestApp,
  validRegistration,
  insertUser,
};
