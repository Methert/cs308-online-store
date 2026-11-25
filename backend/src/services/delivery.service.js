// Rules for the delivery list and for moving an order forward (requirements 3 and 12).
//
// An order only moves forward, one step at a time:
//   processing -> in_transit -> delivered
// It can never go back, skip a step, or change after it is delivered or cancelled.
const { AppError } = require('../utils/AppError');

const NEXT_STATUS = {
  processing: 'in_transit',
  in_transit: 'delivered',
};

function createDeliveryService({ deliveryRepository }) {
  return {
    async listDeliveries({ status, page, limit }) {
      const { items, total } = await deliveryRepository.list({
        status: status ?? null,
        skip: (page - 1) * limit,
        take: limit,
      });
      return {
        deliveries: items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },

    async updateOrderStatus(orderId, newStatus) {
      const order = await deliveryRepository.findOrder(orderId);
      if (!order) {
        throw new AppError(404, 'Order not found');
      }

      if (order.status === 'cancelled') {
        throw new AppError(409, 'A cancelled order cannot be shipped');
      }
      if (order.status === 'delivered') {
        throw new AppError(409, 'The order is already delivered');
      }
      if (order.status === newStatus) {
        throw new AppError(409, `The order is already ${newStatus}`);
      }
      if (NEXT_STATUS[order.status] !== newStatus) {
        throw new AppError(
          409,
          `An order in "${order.status}" can only move to "${NEXT_STATUS[order.status]}"`,
        );
      }

      // Someone (for example the customer cancelling) may have changed the order since we read
      // it. changeStatus only updates it if the status is still the one we checked above.
      const changed = await deliveryRepository.changeStatus(orderId, order.status, newStatus);
      if (!changed) {
        throw new AppError(
          409,
          'The order was changed at the same time, please refresh and try again',
        );
      }

      const updated = await deliveryRepository.getOrder(orderId);
      return { ...updated, totalPrice: Number(updated.totalPrice) };
    },
  };
}

module.exports = { createDeliveryService, NEXT_STATUS };
