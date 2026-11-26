// Rules for the product manager's delivery list and order status requests (requirement 12).
const { z } = require('zod');
const { pageField } = require('./common');

// The statuses a product manager can move an order to. "processing" is where every order
// starts and "cancelled" is the customer's own action, so neither can be chosen here.
const ORDER_STATUS_STEPS = Object.freeze(['in_transit', 'delivered']);

// PATCH /api/orders/:id/status   body: { "status": "in_transit" }
const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_STEPS, {
    error: `status must be one of: ${ORDER_STATUS_STEPS.join(', ')}`,
  }),
});

// The delivery list never shows cancelled orders (the delivery_list view leaves them out).
const DELIVERY_STATUSES = Object.freeze(['processing', 'in_transit', 'delivered']);

// GET /api/deliveries?status=processing&page=1&limit=20
const deliveryListQuerySchema = z.object({
  status: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .enum(DELIVERY_STATUSES, { error: `status must be one of: ${DELIVERY_STATUSES.join(', ')}` })
      .optional(),
  ),
  page: pageField('page', 100000, 1),
  limit: pageField('limit', 100, 20),
});

module.exports = {
  ORDER_STATUS_STEPS,
  DELIVERY_STATUSES,
  updateOrderStatusSchema,
  deliveryListQuerySchema,
};
