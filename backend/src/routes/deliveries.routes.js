// Product manager endpoints for shipping orders (requirement 12):
//
//   GET   /api/deliveries                 delivery list, one row per ordered product
//                                         ?status=processing|in_transit|delivered&page=&limit=
//   PATCH /api/orders/:id/status          move an order forward: { "status": "in_transit" }
//                                         or { "status": "delivered" }
//
// Both need a product_manager token. The status route lives here (and not in Kerem's
// orders.routes.js) because it belongs to the product manager's delivery work.
const express = require('express');
const { validateBody } = require('../middleware/validateBody');
const { validateQuery } = require('../middleware/validateQuery');
const { parseId } = require('../validators/common');
const {
  deliveryListQuerySchema,
  updateOrderStatusSchema,
} = require('../validators/delivery.schemas');

function createDeliveryRouter({ deliveryService, authenticate, requireRole, ROLES }) {
  const router = express.Router();

  router.get(
    '/',
    authenticate,
    requireRole(ROLES.PRODUCT_MANAGER),
    validateQuery(deliveryListQuerySchema),
    async (req, res) => {
      const result = await deliveryService.listDeliveries(req.validatedQuery);
      res.status(200).json({ data: result });
    },
  );

  return router;
}

// Mounted on /api/orders next to Kerem's order router. It only answers PATCH /:id/status;
// every other /api/orders request passes through to orders.routes.js.
function createOrderStatusRouter({ deliveryService, authenticate, requireRole, ROLES }) {
  const router = express.Router();

  router.patch(
    '/:id/status',
    authenticate,
    requireRole(ROLES.PRODUCT_MANAGER),
    validateBody(updateOrderStatusSchema),
    async (req, res) => {
      const orderId = parseId(req.params.id, 'Order id');
      const order = await deliveryService.updateOrderStatus(orderId, req.body.status);
      res.status(200).json({ data: { order } });
    },
  );

  return router;
}

module.exports = { createDeliveryRouter, createOrderStatusRouter };
