// Endpoints under /api/categories (each category is a card set)
//
// Everyone:
//   GET    /api/categories                all categories with their number of products on sale
//   GET    /api/categories/:id            one category
//   GET    /api/categories/:id/products   the category's products; same ?q=, ?sort=, ?page=,
//                                         ?limit= as GET /api/products
//
// Product manager only (requirement 12):
//   POST   /api/categories
//   PATCH  /api/categories/:id
//   DELETE /api/categories/:id            only when no product uses it
const express = require('express');
const { validateBody } = require('../middleware/validateBody');
const { validateQuery } = require('../middleware/validateQuery');
const {
  categoryProductsQuerySchema,
  createCategorySchema,
  updateCategorySchema,
  parseId,
} = require('../validators/catalog.schemas');

function createCategoryRouter({
  categoryService,
  productService,
  authenticate,
  requireRole,
  ROLES,
}) {
  const router = express.Router();
  const productManagerOnly = [authenticate, requireRole(ROLES.PRODUCT_MANAGER)];
  const categoryId = (req) => parseId(req.params.id, 'Category id');

  router.get('/', async (req, res) => {
    const categories = await categoryService.listCategories();
    res.status(200).json({ data: { categories } });
  });

  router.get('/:id', async (req, res) => {
    const category = await categoryService.getCategory(categoryId(req));
    res.status(200).json({ data: { category } });
  });

  router.get('/:id/products', validateQuery(categoryProductsQuerySchema), async (req, res) => {
    const result = await productService.listProductsInCategory(categoryId(req), req.validatedQuery);
    res.status(200).json({ data: result });
  });

  router.post('/', ...productManagerOnly, validateBody(createCategorySchema), async (req, res) => {
    const category = await categoryService.createCategory(req.body);
    res.status(201).json({ data: { category } });
  });

  router.patch(
    '/:id',
    ...productManagerOnly,
    validateBody(updateCategorySchema),
    async (req, res) => {
      const category = await categoryService.updateCategory(categoryId(req), req.body);
      res.status(200).json({ data: { category } });
    },
  );

  router.delete('/:id', ...productManagerOnly, async (req, res) => {
    await categoryService.deleteCategory(categoryId(req));
    res.status(204).end();
  });

  return router;
}

module.exports = { createCategoryRouter };
