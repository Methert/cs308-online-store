// Demo orders for the demo customer, one for every step a demo needs:
//   SEED-1  delivered 10 days ago  -> can be reviewed and returned (requirements 5, 16)
//   SEED-2  delivered 45 days ago  -> can be reviewed, the 30-day return window has passed
//   SEED-3  in transit             -> shows on the delivery list as not completed (requirement 12)
//   SEED-4  processing             -> can still be cancelled (requirement 14)
// Each order has a payment and an invoice like a real one. The seed does not lower stock: these
// orders stand for sales made before the demo.
// Running the seed again skips orders that already exist (found by their payment's bank reference).
const crypto = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;

const PLAN = [
  {
    key: 'SEED-1',
    status: 'delivered',
    daysAgo: 10,
    lines: [
      [0, 1],
      [1, 2],
    ],
  },
  { key: 'SEED-2', status: 'delivered', daysAgo: 45, lines: [[2, 1]] },
  { key: 'SEED-3', status: 'in_transit', daysAgo: 3, lines: [[3, 1]] },
  { key: 'SEED-4', status: 'processing', daysAgo: 1, lines: [[4, 1]] },
];

// The same invoice number format as src/services/invoice.service.js.
function invoiceNumber(date, orderId) {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${day}-${String(orderId).padStart(6, '0')}`;
}

// products: at least 5 { id, price } rows. Returns plain order descriptions (no database).
function buildDemoOrders(products, now = new Date()) {
  if (products.length < 5) throw new Error('The demo orders need at least 5 products in stock');
  return PLAN.map(({ key, status, daysAgo, lines }) => {
    const items = lines.map(([index, quantity]) => ({
      productId: products[index].id,
      quantity,
      unitPrice: Number(products[index].price),
    }));
    const totalPrice = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return {
      key,
      status,
      createdAt: new Date(now.getTime() - daysAgo * DAY_MS),
      totalPrice: Math.round(totalPrice * 100) / 100,
      items,
    };
  });
}

async function seedDemoOrders(prisma, { customer, now = new Date() }) {
  const products = await prisma.product.findMany({
    where: { isActive: true, stockQuantity: { gt: 0 } },
    orderBy: { serialNumber: 'asc' },
    take: 5,
    select: { id: true, price: true },
  });
  let created = 0;
  for (const order of buildDemoOrders(products, now)) {
    const exists = await prisma.payment.findFirst({ where: { bankReference: order.key } });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      const saved = await tx.order.create({
        data: {
          userId: customer.id,
          status: order.status,
          totalPrice: order.totalPrice,
          deliveryAddress: customer.homeAddress,
          createdAt: order.createdAt,
          items: { create: order.items },
          payment: {
            create: {
              amount: order.totalPrice,
              cardHolder: customer.name,
              cardLast4: '4242',
              // Placeholder: seeded orders were never paid with a real card number.
              cardHash: crypto.createHash('sha256').update(order.key).digest('hex'),
              bankReference: order.key,
              createdAt: order.createdAt,
            },
          },
        },
      });
      await tx.invoice.create({
        data: {
          orderId: saved.id,
          invoiceNumber: invoiceNumber(order.createdAt, saved.id),
          totalPrice: order.totalPrice,
          createdAt: order.createdAt,
        },
      });
    });
    created += 1;
  }
  return { created, total: PLAN.length };
}

module.exports = { buildDemoOrders, seedDemoOrders, invoiceNumber };
