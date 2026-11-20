// The ONLY place that talks to the categories table. Each category is a card set.
const { AppError } = require('../utils/AppError');
const { mapPrismaError } = require('./prismaErrors');

// productCount counts only products that are on sale, as the shop shows them.
const WITH_PRODUCT_COUNT = {
  _count: { select: { products: { where: { isActive: true } } } },
};

// Newest sets first; sets without a release date at the end.
const ORDER_BY = [{ releaseDate: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }, { id: 'asc' }];

function withProductCount({ _count, ...category }) {
  return { ...category, productCount: _count?.products ?? 0 };
}

function createCategoryRepository(prisma) {
  async function findById(id) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: WITH_PRODUCT_COUNT,
    });
    return category ? withProductCount(category) : null;
  }

  return {
    async list() {
      const categories = await prisma.category.findMany({
        orderBy: ORDER_BY,
        include: WITH_PRODUCT_COUNT,
      });
      return categories.map(withProductCount);
    },

    findById,

    async exists(id) {
      const category = await prisma.category.findUnique({ where: { id }, select: { id: true } });
      return category !== null;
    },

    async create(data) {
      try {
        const category = await prisma.category.create({ data, include: WITH_PRODUCT_COUNT });
        return withProductCount(category);
      } catch (err) {
        throw mapPrismaError(err, { entity: 'Category' });
      }
    },

    // Returns null if there is no category with this id.
    async update(id, data) {
      try {
        const category = await prisma.category.update({
          where: { id },
          data,
          include: WITH_PRODUCT_COUNT,
        });
        return withProductCount(category);
      } catch (err) {
        if (err && err.code === 'P2025') return null;
        throw mapPrismaError(err, { entity: 'Category' });
      }
    },

    // A category that still has products (even removed ones, which old orders point at)
    // cannot be deleted. The database's foreign key enforces this too, so two requests at the
    // same moment cannot get around the check.
    // Returns false if there is no category with this id.
    async remove(id) {
      const productCount = await prisma.product.count({ where: { categoryId: id } });
      if (productCount > 0) {
        throw new AppError(
          409,
          'Category still has products (removed ones are kept for order history); move them to another category first',
        );
      }
      try {
        await prisma.category.delete({ where: { id } });
        return true;
      } catch (err) {
        if (err && err.code === 'P2025') return false;
        if (err && err.code === 'P2003') {
          throw new AppError(
            409,
            'Category still has products (removed ones are kept for order history); move them to another category first',
          );
        }
        throw err;
      }
    },
  };
}

module.exports = { createCategoryRepository };
