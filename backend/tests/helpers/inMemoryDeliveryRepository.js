// Fake delivery repository that keeps orders in an array.
// It behaves like src/repositories/delivery.repository.js so the tests need no database.
function createInMemoryDeliveryRepository() {
  // Each order: { id, userId, customerName, status, deliveryAddress, totalPrice, createdAt, items }
  // Each item: { id, productId, productName, quantity, unitPrice }
  const orders = [];

  // Same rows as the "delivery_list" view: one row per order item, no cancelled orders.
  function deliveryRows() {
    const rows = [];
    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      for (const item of order.items) {
        rows.push({
          deliveryId: item.id,
          orderId: order.id,
          customerId: order.userId,
          customerName: order.customerName,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          totalPrice: item.quantity * item.unitPrice,
          deliveryAddress: order.deliveryAddress,
          status: order.status,
          completed: order.status === 'delivered',
          orderedAt: order.createdAt,
        });
      }
    }
    rows.sort((a, b) => a.orderedAt - b.orderedAt || a.deliveryId - b.deliveryId);
    return rows;
  }

  return {
    orders,

    // Test helper: adds an order with its items.
    addOrder({ status = 'processing', items = [{ quantity: 1, unitPrice: 10 }], ...rest } = {}) {
      const id = orders.length + 1;
      const order = {
        id,
        userId: 1,
        customerName: 'Ash Ketchum',
        status,
        deliveryAddress: 'Pallet Town, Route 1',
        totalPrice: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
        createdAt: new Date(Date.UTC(2026, 10, id)),
        updatedAt: new Date(Date.UTC(2026, 10, id)),
        ...rest,
        items: items.map((item, index) => ({
          id: id * 100 + index,
          productId: index + 1,
          productName: `Card ${index + 1}`,
          ...item,
        })),
      };
      orders.push(order);
      return order;
    },

    async list({ status = null, skip, take }) {
      const rows = deliveryRows().filter((row) => status === null || row.status === status);
      return { items: rows.slice(skip, skip + take), total: rows.length };
    },

    async findOrder(id) {
      const order = orders.find((o) => o.id === id);
      return order ? { id: order.id, userId: order.userId, status: order.status } : null;
    },

    async changeStatus(id, fromStatus, toStatus) {
      const order = orders.find((o) => o.id === id && o.status === fromStatus);
      if (!order) return false;
      order.status = toStatus;
      order.updatedAt = new Date();
      return true;
    },

    async getOrder(id) {
      const order = orders.find((o) => o.id === id);
      if (!order) return null;
      const { items, customerName, ...rest } = order;
      return rest;
    },
  };
}

module.exports = { createInMemoryDeliveryRepository };
