// Tests for the database layer of the catalog, using mocks that imitate Prisma.
// They check that the right queries are sent: the search filter, the atomic stock update and
// the popularity calculation.
const {
  createProductRepository,
  buildProductWhere,
  escapeLikePattern,
} = require('../src/repositories/product.repository');
const { createCategoryRepository } = require('../src/repositories/category.repository');
const { mapPrismaError } = require('../src/repositories/prismaErrors');
const { AppError } = require('../src/utils/AppError');

const prismaError = (code, meta) => Object.assign(new Error(code), { code, meta });

function mockPrisma(overrides = {}) {
  return {
    product: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      ...overrides.product,
    },
    orderItem: { groupBy: jest.fn().mockResolvedValue([]), ...overrides.orderItem },
    cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), ...overrides.cartItem },
    category: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      ...overrides.category,
    },
    // Array form: run the queries; the real Prisma runs them in one transaction.
    $transaction: jest.fn((queries) => Promise.all(queries)),
  };
}

describe('escapeLikePattern', () => {
  test('makes %, _ and \\ literal so they do not act as wildcards', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  test('leaves normal text unchanged', () => {
    expect(escapeLikePattern('Charizard ex')).toBe('Charizard ex');
  });
});

describe('buildProductWhere', () => {
  test('shows only products on sale by default', () => {
    expect(buildProductWhere({})).toEqual({ isActive: true });
  });

  test('searches the name OR the description, ignoring case', () => {
    expect(buildProductWhere({ q: 'pika' })).toEqual({
      isActive: true,
      OR: [
        { name: { contains: 'pika', mode: 'insensitive' } },
        { description: { contains: 'pika', mode: 'insensitive' } },
      ],
    });
  });

  test('filters by category and status', () => {
    expect(buildProductWhere({ categoryId: 3, status: 'inactive' })).toEqual({
      isActive: false,
      categoryId: 3,
    });
    expect(buildProductWhere({ status: 'all' })).toEqual({});
  });
});

describe('productRepository.list', () => {
  test('sorts by price with the id as a tie breaker and pages with skip/take', async () => {
    const prisma = mockPrisma();
    const repository = createProductRepository(prisma);

    await repository.list({ sort: 'price_asc', skip: 40, take: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ price: 'asc' }, { id: 'asc' }],
        skip: 40,
        take: 20,
        where: { isActive: true },
      }),
    );
    expect(prisma.product.count).toHaveBeenCalledWith({ where: { isActive: true } });
  });

  test('popularity counts copies sold, ignoring cancelled orders', async () => {
    const prisma = mockPrisma({
      product: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]) // all matching ids
          .mockResolvedValueOnce([
            { id: 1, name: 'A' },
            { id: 2, name: 'B' },
            { id: 3, name: 'C' },
          ]),
      },
      orderItem: {
        groupBy: jest.fn().mockResolvedValue([
          { productId: 3, _sum: { quantity: 7 } },
          { productId: 1, _sum: { quantity: 2 } },
        ]),
      },
    });
    const repository = createProductRepository(prisma);

    const result = await repository.list({ sort: 'popularity', skip: 0, take: 2 });

    expect(prisma.orderItem.groupBy).toHaveBeenCalledWith({
      by: ['productId'],
      where: { productId: { in: [1, 2, 3] }, order: { status: { not: 'cancelled' } } },
      _sum: { quantity: true },
    });
    expect(result.items.map((p) => [p.id, p.soldCount])).toEqual([
      [3, 7],
      [1, 2],
    ]);
    expect(result.total).toBe(3);
  });

  test('an unknown sort is a programming error', async () => {
    const repository = createProductRepository(mockPrisma());

    await expect(repository.list({ sort: 'random' })).rejects.toThrow('Unknown sort: random');
  });
});

describe('productRepository.adjustStock', () => {
  test('removes copies with one conditional UPDATE (stock never below 0)', async () => {
    const prisma = mockPrisma({
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 5, stockQuantity: 1 }),
      },
    });
    const repository = createProductRepository(prisma);

    await repository.adjustStock(5, -2);

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 5, stockQuantity: { gte: 2 } },
      data: { stockQuantity: { increment: -2 } },
    });
  });

  test('adding copies has no stock condition', async () => {
    const prisma = mockPrisma({
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 5, stockQuantity: 9 }),
      },
    });
    const repository = createProductRepository(prisma);

    await repository.adjustStock(5, 4);

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { stockQuantity: { increment: 4 } },
    });
  });

  test('gives 409 when there are not enough copies, null when the product is missing', async () => {
    const notEnough = mockPrisma({
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ stockQuantity: 1 }),
      },
    });
    const missing = mockPrisma({
      product: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(createProductRepository(notEnough).adjustStock(5, -3)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(createProductRepository(missing).adjustStock(5, -3)).resolves.toBeNull();
  });
});

describe('productRepository.deactivate', () => {
  test('hides the product and empties the carts in one transaction', async () => {
    const prisma = mockPrisma({
      product: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ id: 5, isActive: false }),
      },
    });
    const repository = createProductRepository(prisma);

    await repository.deactivate(5);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isActive: false },
    });
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({ where: { productId: 5 } });
  });

  test('returns null for a product that does not exist', async () => {
    const prisma = mockPrisma({
      product: { update: jest.fn().mockRejectedValue(prismaError('P2025')) },
    });

    await expect(createProductRepository(prisma).deactivate(5)).resolves.toBeNull();
  });
});

describe('productRepository.create', () => {
  test('turns a duplicate serial number into a 409', async () => {
    const duplicate = prismaError('P2002', {
      driverAdapterError: {
        cause: { constraint: { index: 'products_serial_number_key' }, table: 'products' },
      },
    });
    const prisma = mockPrisma({ product: { create: jest.fn().mockRejectedValue(duplicate) } });

    const promise = createProductRepository(prisma).create({});

    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({
      statusCode: 409,
      message: 'Product with this serial number already exists',
    });
  });
});

describe('categoryRepository.remove', () => {
  test('refuses to delete a category that still has products', async () => {
    const prisma = mockPrisma({ product: { count: jest.fn().mockResolvedValue(2) } });

    await expect(createCategoryRepository(prisma).remove(1)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  test('a product added at the same moment is still caught by the foreign key (409)', async () => {
    const prisma = mockPrisma({
      category: { delete: jest.fn().mockRejectedValue(prismaError('P2003')) },
    });

    await expect(createCategoryRepository(prisma).remove(1)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('returns false for a category that does not exist', async () => {
    const prisma = mockPrisma({
      category: { delete: jest.fn().mockRejectedValue(prismaError('P2025')) },
    });

    await expect(createCategoryRepository(prisma).remove(1)).resolves.toBe(false);
  });
});

describe('mapPrismaError', () => {
  test('names the duplicate field from the older meta.target form too', () => {
    const err = mapPrismaError(prismaError('P2002', { target: ['set_code'] }), {
      entity: 'Category',
    });

    expect(err).toMatchObject({
      statusCode: 409,
      message: 'Category with this set code already exists',
    });
  });

  test('a broken category link becomes 400 "Category not found"', () => {
    expect(mapPrismaError(prismaError('P2003'), { entity: 'Product' })).toMatchObject({
      statusCode: 400,
      message: 'Category not found',
    });
  });

  test('passes other errors through unchanged', () => {
    const other = prismaError('P1001');

    expect(mapPrismaError(other, { entity: 'Product' })).toBe(other);
  });
});
