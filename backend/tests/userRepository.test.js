// We test how the repository translates errors, using a mock that imitates Prisma.
const { createUserRepository } = require('../src/repositories/user.repository');
const { AppError } = require('../src/utils/AppError');

function prismaThatThrows(error) {
  return { user: { create: jest.fn().mockRejectedValue(error) } };
}

describe('userRepository.create', () => {
  test('turns a duplicate-email database error into a 409 AppError', async () => {
    const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const repository = createUserRepository(prismaThatThrows(duplicate));

    const promise = repository.create({ email: 'ash@pokeshop.test' });

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ statusCode: 409 });
  });

  test('passes other database errors through unchanged', async () => {
    const other = Object.assign(new Error('connection lost'), { code: 'P1001' });
    const repository = createUserRepository(prismaThatThrows(other));

    await expect(repository.create({})).rejects.toBe(other);
  });

  test('looks users up by email with findUnique', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    const repository = createUserRepository(prisma);

    await repository.findByEmail('ash@pokeshop.test');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ash@pokeshop.test' } });
  });
});
