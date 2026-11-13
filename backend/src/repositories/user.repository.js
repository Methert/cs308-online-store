// The ONLY place that talks to the users table.
// Services use this object instead of the database directly. That way tests can pass a fake
// in-memory repository instead of a real database
// (see tests/helpers/inMemoryUserRepository.js).
const { AppError } = require('../utils/AppError');

// Prisma error code for "a unique field already exists"
const UNIQUE_CONSTRAINT_FAILED = 'P2002';

function createUserRepository(prisma) {
  return {
    findByEmail(email) {
      return prisma.user.findUnique({ where: { email } });
    },

    findById(id) {
      return prisma.user.findUnique({ where: { id } });
    },

    async create(data) {
      try {
        return await prisma.user.create({ data });
      } catch (err) {
        // If two people register with the same email at the same moment, the check in the
        // service can pass for both; the UNIQUE constraint in the database stops the second
        // one here (concurrency).
        if (err && err.code === UNIQUE_CONSTRAINT_FAILED) {
          throw new AppError(409, 'Email is already registered');
        }
        throw err;
      }
    },
  };
}

module.exports = { createUserRepository };
