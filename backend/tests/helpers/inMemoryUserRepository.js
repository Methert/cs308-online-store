// Test double: a fake repository that works in memory instead of a real database.
// It has the same functions as the real repository, so the service cannot tell the difference.
const { AppError } = require('../../src/utils/AppError');

function createInMemoryUserRepository() {
  const users = [];
  let nextId = 1;

  return {
    users, // exposed so that tests can inspect the content

    async findByEmail(email) {
      const user = users.find((u) => u.email === email);
      return user ? { ...user } : null;
    },

    async findById(id) {
      const user = users.find((u) => u.id === id);
      return user ? { ...user } : null;
    },

    async create(data) {
      if (users.some((u) => u.email === data.email)) {
        throw new AppError(409, 'Email is already registered');
      }
      const now = new Date();
      const user = {
        id: nextId++,
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role ?? 'customer',
        taxId: data.taxId ?? null,
        homeAddress: data.homeAddress ?? null,
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);
      return { ...user };
    },
  };
}

module.exports = { createInMemoryUserRepository };
