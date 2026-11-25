// Database queries for the delivery list and the order status (requirement 12).
//
// The delivery list comes from the "delivery_list" view that Ahmet wrote in the migration
// (one row per ordered product, cancelled orders left out). Prisma does not know views, so we
// read it with $queryRaw. The ${...} values are sent as parameters, never pasted into the SQL,
// so this is safe from SQL injection.

function toDelivery(row) {
  return {
    deliveryId: row.deliveryId,
    orderId: row.orderId,
    customerId: row.customerId,
    customerName: row.customerName,
    productId: row.productId,
    productName: row.productName,
    quantity: row.quantity,
    // DECIMAL comes back as a Decimal object; the API sends plain numbers like the products API.
    totalPrice: Number(row.totalPrice),
    deliveryAddress: row.deliveryAddress,
    status: row.status,
    completed: row.completed,
    orderedAt: row.orderedAt,
  };
}

function createDeliveryRepository(prisma) {
  return {
    // status: 'processing' | 'in_transit' | 'delivered', or null for all of them.
    // Oldest orders first, because they should be shipped first.
    async list({ status = null, skip, take }) {
      const rows = await prisma.$queryRaw`
        SELECT d.delivery_id      AS "deliveryId",
               d.order_id         AS "orderId",
               d.customer_id      AS "customerId",
               u.name             AS "customerName",
               d.product_id       AS "productId",
               p.name             AS "productName",
               d.quantity         AS "quantity",
               d.total_price      AS "totalPrice",
               d.delivery_address AS "deliveryAddress",
               d.status::text     AS "status",
               d.completed        AS "completed",
               d.ordered_at       AS "orderedAt"
        FROM   delivery_list d
        JOIN   users u    ON u.id = d.customer_id
        JOIN   products p ON p.id = d.product_id
        WHERE  (${status}::text IS NULL OR d.status::text = ${status}::text)
        ORDER  BY d.ordered_at ASC, d.delivery_id ASC
        LIMIT  ${take} OFFSET ${skip}
      `;

      const countRows = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS "total"
        FROM   delivery_list d
        WHERE  (${status}::text IS NULL OR d.status::text = ${status}::text)
      `;

      return { items: rows.map(toDelivery), total: countRows[0].total };
    },

    findOrder(id) {
      return prisma.order.findUnique({
        where: { id },
        select: { id: true, userId: true, status: true },
      });
    },

    // Changes the status only if the order is still in the status we expect.
    // This is one UPDATE ... WHERE id = ? AND status = ?, so if a customer cancels the order at
    // the same moment, only one of the two changes can win (requirement 18).
    // Returns true if the order was changed.
    async changeStatus(id, fromStatus, toStatus) {
      const result = await prisma.order.updateMany({
        where: { id, status: fromStatus },
        data: { status: toStatus },
      });
      return result.count === 1;
    },

    getOrder(id) {
      return prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          userId: true,
          status: true,
          totalPrice: true,
          deliveryAddress: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    },
  };
}

module.exports = { createDeliveryRepository };
