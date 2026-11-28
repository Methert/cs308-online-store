// Tests for the demo orders the seed adds (prisma/seed-orders.js).
const { buildDemoOrders, invoiceNumber } = require('../prisma/seed-orders');

const products = [
  { id: 11, price: '4.00' },
  { id: 12, price: '2.50' },
  { id: 13, price: '60.00' },
  { id: 14, price: '1.00' },
  { id: 15, price: '9.99' },
];
const now = new Date('2026-11-27T12:00:00Z');

test('one demo order for each step: two delivered, one in transit, one processing', () => {
  const orders = buildDemoOrders(products, now);
  expect(orders.map((order) => [order.key, order.status])).toEqual([
    ['SEED-1', 'delivered'],
    ['SEED-2', 'delivered'],
    ['SEED-3', 'in_transit'],
    ['SEED-4', 'processing'],
  ]);
});

test('one delivered order is inside the 30-day return window and one is outside', () => {
  const [recent, old] = buildDemoOrders(products, now);
  const days = (order) => (now - order.createdAt) / (24 * 60 * 60 * 1000);
  expect(days(recent)).toBeLessThan(30);
  expect(days(old)).toBeGreaterThan(30);
});

test('the total is the sum of the lines at the price paid', () => {
  const [first] = buildDemoOrders(products, now);
  expect(first.items).toEqual([
    { productId: 11, quantity: 1, unitPrice: 4 },
    { productId: 12, quantity: 2, unitPrice: 2.5 },
  ]);
  expect(first.totalPrice).toBe(9);
});

test('needs five products in stock', () => {
  expect(() => buildDemoOrders(products.slice(0, 4), now)).toThrow('at least 5 products');
});

test('invoice numbers use the same format as the invoice service', () => {
  expect(invoiceNumber(new Date('2026-11-17T09:00:00Z'), 42)).toBe('INV-20261117-000042');
});
