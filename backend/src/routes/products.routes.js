// Endpoints under /api/products
//
// Everyone (no login needed, requirement 4):
//   GET    /api/products              list, search (?q=), filter (?categoryId=), sort (?sort=),
//                                     pages (?page=&limit=)
//   GET    /api/products/:id          product detail
//
// Product and sales managers (read only, includes removed products and the cost):
//   GET    /api/products/manage       same filters plus ?status=active|inactive|all
//   GET    /api/products/manage/:id
//
// Product manager only (requirement 12):
//   POST   /api/products              add a product
//   PATCH  /api/products/:id          change product fields (not the stock)
//   DELETE /api/products/:id          take the product off sale (the row is kept)
//   PATCH  /api/products/:id/stock    set the stock, or add/remove copies
const express = require('express');
const { validateBody } = require('../middleware/validateBody');
const { validateQuery } = require('../middleware/validateQuery');
const {
  productListQuerySchema,
  managedProductListQuerySchema,
  createProductSchema,
  updateProductSchema,
  updateStockSchema,
  parseId,
} = require('../validators/catalog.schemas');

function createProductRouter({ productService, authenticate, requireRole, ROLES }) {
  const router = express.Router();
  const managersOnly = [authenticate, requireRole(ROLES.PRODUCT_MANAGER, ROLES.SALES_MANAGER)];
  const productManagerOnly = [authenticate, requireRole(ROLES.PRODUCT_MANAGER)];
  const productId = (req) => parseId(req.params.id, 'Product id');

  // --- Public ----------------------------------------------------------------

  router.get('/', validateQuery(productListQuerySchema), async (req, res) => {
    const result = await productService.listProducts(req.validatedQuery);
    res.status(200).json({ data: result });
  });

  // "/manage" must come before "/:id", otherwise "manage" would be read as a product id.
  router.get(
    '/manage',
    ...managersOnly,
    validateQuery(managedProductListQuerySchema),
    async (req, res) => {
      const result = await productService.listManagedProducts(req.validatedQuery);
      res.status(200).json({ data: result });
    },
  );

  router.get('/manage/:id', ...managersOnly, async (req, res) => {
    const product = await productService.getManagedProduct(productId(req));
    res.status(200).json({ data: { product } });
  });

  router.get('/:id', async (req, res) => {
    const product = await productService.getProduct(productId(req));
    res.status(200).json({ data: { product } });
  });

  // --- Product manager -------------------------------------------------------

  router.post('/', ...productManagerOnly, validateBody(createProductSchema), async (req, res) => {
    const product = await productService.createProduct(req.body);
    res.status(201).json({ data: { product } });
  });

  router.patch(
    '/:id',
    ...productManagerOnly,
    validateBody(updateProductSchema),
    async (req, res) => {
      const product = await productService.updateProduct(productId(req), req.body);
      res.status(200).json({ data: { product } });
    },
  );

  router.delete('/:id', ...productManagerOnly, async (req, res) => {
    const product = await productService.removeProduct(productId(req));
    res.status(200).json({ data: { product } });
  });

  router.patch(
    '/:id/stock',
    ...productManagerOnly,
    validateBody(updateStockSchema),
    async (req, res) => {
      const product = await productService.updateStock(productId(req), req.body);
      res.status(200).json({ data: { product } });
    },
  );

  return router;
}

module.exports = { createProductRouter };
