// Orders saved by the checkout page.
// TODO: load the signed-in customer's orders from GET /api/orders instead.

export const ORDERS_KEY = 'peko-cards-orders-v1';

// same values as the order_status enum in the database
export const statusLabels = {
  processing: 'Processing',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// an order moves through these steps, a cancelled order stops
export const steps = ['processing', 'in_transit', 'delivered'];

// the demo account (trainer@example.com) already has one order for every other status
const demoUserId = 'demo:trainer@example.com';

export const sampleOrders = [
  {
    id: 1001,
    userId: demoUserId,
    date: '2026-10-28T14:20:00.000Z',
    status: 'delivered',
    items: [
      { id: 166, name: 'Bulbasaur', price: 2890, quantity: 1 },
      { id: 193, name: 'Mew ex', price: 1990, quantity: 2 },
    ],
    total: 6870,
    customer: 'Peko Trainer',
    address: '12 Sample Street, Istanbul 34710',
    cardLast4: '4242',
  },
  {
    id: 1002,
    userId: demoUserId,
    date: '2026-11-09T09:05:00.000Z',
    status: 'in_transit',
    items: [{ id: 173, name: 'Pikachu', price: 2250, quantity: 1 }],
    total: 2250,
    customer: 'Peko Trainer',
    address: '12 Sample Street, Istanbul 34710',
    cardLast4: '4242',
  },
  {
    id: 1003,
    userId: demoUserId,
    date: '2026-11-14T18:40:00.000Z',
    status: 'cancelled',
    items: [{ id: 198, name: 'Venusaur ex', price: 5990, quantity: 1 }],
    total: 5990,
    customer: 'Peko Trainer',
    address: '12 Sample Street, Istanbul 34710',
    cardLast4: '5100',
  },
];

export function readOrders() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(ORDERS_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    // broken or blocked storage, start with the sample orders
  }
  return sampleOrders;
}

export function saveOrders(orders) {
  try {
    window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    return true;
  } catch {
    return false;
  }
}

export function ordersFor(orders, userId) {
  return orders.filter(order => order.userId === userId);
}

// newest order first
export function sortOrders(orders) {
  return [...orders].sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function filterOrders(orders, status) {
  if (status === 'all') return orders;
  return orders.filter(order => order.status === status);
}

// 0 = processing, 1 = in transit, 2 = delivered, -1 = cancelled
export function stepIndex(status) {
  return steps.indexOf(status);
}

export function formatDate(isoDate) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(isoDate));
}
