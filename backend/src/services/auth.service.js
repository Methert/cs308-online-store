// Business logic for registering, logging in and "who am I".
// This file knows nothing about HTTP (no req/res), so it is easy to test.
const bcrypt = require('bcryptjs');
const { AppError } = require('../utils/AppError');
const { ROLES } = require('../constants/roles');

const INVALID_CREDENTIALS = 'Invalid email or password';

// The user object returned to the outside. passwordHash NEVER leaves the server.
function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    taxId: user.taxId ?? null,
    homeAddress: user.homeAddress ?? null,
    createdAt: user.createdAt,
  };
}

function createAuthService({ userRepository, tokenService, saltRounds = 10 }) {
  // When the user is not found we still run a bcrypt comparison, so the response time does not
  // reveal whether an email is registered (timing attack).
  let dummyHash = null;
  async function getDummyHash() {
    if (!dummyHash) {
      dummyHash = await bcrypt.hash('dummy-password-for-timing', saltRounds);
    }
    return dummyHash;
  }

  async function register({ name, email, password, taxId, homeAddress }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new AppError(409, 'Email is already registered');
    }

    const passwordHash = await bcrypt.hash(password, saltRounds);
    const user = await userRepository.create({
      name,
      email,
      passwordHash,
      role: ROLES.CUSTOMER, // Everyone who registers is a customer; the role cannot be chosen.
      taxId,
      homeAddress,
    });

    return { user: toPublicUser(user), token: tokenService.sign(user) };
  }

  async function login({ email, password }) {
    const user = await userRepository.findByEmail(email);
    const hashToCompare = user ? user.passwordHash : await getDummyHash();
    const passwordMatches = await bcrypt.compare(password, hashToCompare);

    // The SAME message for "no such email" and "wrong password": do not tell an attacker which
    // one was correct.
    if (!user || !passwordMatches) {
      throw new AppError(401, INVALID_CREDENTIALS);
    }

    return { user: toPublicUser(user), token: tokenService.sign(user) };
  }

  async function getCurrentUser(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      // The token is valid but the account was deleted
      throw new AppError(401, 'User no longer exists');
    }
    return toPublicUser(user);
  }

  return { register, login, getCurrentUser };
}

module.exports = { createAuthService, toPublicUser };
