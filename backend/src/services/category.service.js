// Business rules of the categories (card sets). Requirement 1: products are shown in
// categories. Requirement 12: the product manager manages the categories.
const { AppError } = require('../utils/AppError');

// The database keeps the release date as a DATE; the API sends it as "YYYY-MM-DD".
function toDateOnly(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function toCategory(category) {
  return {
    id: category.id,
    name: category.name,
    description: category.description ?? null,
    setCode: category.setCode ?? null,
    series: category.series ?? null,
    releaseDate: toDateOnly(category.releaseDate),
    productCount: category.productCount ?? 0,
  };
}

function createCategoryService({ categoryRepository }) {
  return {
    async listCategories() {
      return (await categoryRepository.list()).map(toCategory);
    },

    async getCategory(id) {
      const category = await categoryRepository.findById(id);
      if (!category) throw new AppError(404, 'Category not found');
      return toCategory(category);
    },

    async createCategory(data) {
      return toCategory(await categoryRepository.create(data));
    },

    async updateCategory(id, changes) {
      const category = await categoryRepository.update(id, changes);
      if (!category) throw new AppError(404, 'Category not found');
      return toCategory(category);
    },

    async deleteCategory(id) {
      const removed = await categoryRepository.remove(id);
      if (!removed) throw new AppError(404, 'Category not found');
    },
  };
}

module.exports = { createCategoryService, toCategory };
