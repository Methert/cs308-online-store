import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { api, customer, failure, success } from '../test/api-fixture.js';
import { renderShop } from '../test/render-shop.jsx';

const manager = { ...customer, id: 7, name: 'Demo Manager', email: 'pm@pokeshop.test', role: 'product_manager' };
const address = 'Demo Customer, 12 Sample Street, Istanbul 34710';

// rows like the delivery_list view sends them: one row per ordered card, oldest order first
function fakeDeliveries({ totalPages = 1 } = {}) {
  const deliveries = [
    { deliveryId: 3, orderId: 1002, customerId: 99, customerName: 'Demo Customer', productId: 173, productName: 'Pikachu', quantity: 1,
      totalPrice: 22.5, deliveryAddress: address, status: 'in_transit', completed: false, orderedAt: '2026-11-09T09:05:00Z' },
    { deliveryId: 5, orderId: 1004, customerId: 99, customerName: 'Demo Customer', productId: 173, productName: 'Pikachu', quantity: 2,
      totalPrice: 45, deliveryAddress: address, status: 'processing', completed: false, orderedAt: '2026-11-20T10:00:00Z' },
    { deliveryId: 6, orderId: 1004, customerId: 99, customerName: 'Demo Customer', productId: 193, productName: 'Mew ex', quantity: 1,
      totalPrice: 19.9, deliveryAddress: address, status: 'processing', completed: false, orderedAt: '2026-11-20T10:00:00Z' },
  ];
  api.overrides.set('GET /api/deliveries', ({ url }) => {
    const query = new URL(url, 'http://shop.test').searchParams;
    const status = query.get('status');
    const rows = status ? deliveries.filter(row => row.status === status) : deliveries;
    return success({ deliveries: rows, pagination: { page: Number(query.get('page')), limit: 20, total: rows.length, totalPages } });
  });
  return deliveries;
}

function orderCells() {
  return screen.getAllByRole('rowheader').map(cell => cell.textContent);
}

test('a customer cannot open the delivery list', async () => {
  api.signIn(customer);
  renderShop('/deliveries');
  expect(await screen.findByRole('heading', { name: 'Product manager access required' })).toBeTruthy();
  expect(api.calls.some(call => call.path === '/api/deliveries')).toBe(false);
});

test('the delivery list shows every ordered card and filters by status', async () => {
  const user = userEvent.setup();
  api.signIn(manager);
  fakeDeliveries();
  renderShop('/deliveries');
  await screen.findAllByRole('rowheader');
  expect(orderCells()).toEqual(['#1002', '#1004', '#1004']);
  const first = screen.getAllByRole('row')[1];
  expect(within(first).getByText('In transit')).toBeTruthy();
  expect(within(first).getByText('$22.50')).toBeTruthy();
  expect(within(first).getByText(address)).toBeTruthy();
  expect(api.calls.find(call => call.path === '/api/deliveries').options.headers.Authorization).toBe('Bearer token:7');

  await user.click(screen.getByRole('button', { name: 'Processing' }));
  await waitFor(() => expect(orderCells()).toEqual(['#1004', '#1004']));
  expect(api.calls.filter(call => call.path === '/api/deliveries').at(-1).url).toContain('status=processing');
  await user.click(screen.getByRole('button', { name: 'Delivered' }));
  expect(await screen.findByRole('heading', { name: 'No orders are delivered' })).toBeTruthy();
});

test('marking an order in transit changes every card of that order', async () => {
  const user = userEvent.setup();
  api.signIn(manager);
  fakeDeliveries();
  api.overrides.set('PATCH /api/orders/1004/status', ({ body }) => success({ order: { id: 1004, status: body.status } }));
  renderShop('/deliveries');
  await user.click(await screen.findByRole('button', { name: 'Mark in transit: order #1004, Pikachu' }));
  expect(await screen.findByText('Order #1004 is now in transit.')).toBeTruthy();
  const call = api.calls.find(call => call.method === 'PATCH');
  expect(call.path).toBe('/api/orders/1004/status');
  expect(call.body).toEqual({ status: 'in_transit' });
  expect(screen.queryByRole('button', { name: /^Mark in transit/ })).toBeNull();
  expect(screen.getAllByRole('button', { name: /^Mark delivered/ })).toHaveLength(3);
});

test('a delivered order has no next step', async () => {
  const user = userEvent.setup();
  api.signIn(manager);
  fakeDeliveries();
  api.overrides.set('PATCH /api/orders/1002/status', ({ body }) => success({ order: { id: 1002, status: body.status } }));
  renderShop('/deliveries');
  await user.click(await screen.findByRole('button', { name: 'Mark delivered: order #1002, Pikachu' }));
  expect(await screen.findByText('Order #1002 is now delivered.')).toBeTruthy();
  const row = screen.getAllByRole('row')[1];
  expect(within(row).getByText('Delivered')).toBeTruthy();
  expect(within(row).queryByRole('button')).toBeNull();
});

test('a refused status change shows the reason and loads the list again', async () => {
  const user = userEvent.setup();
  api.signIn(manager);
  const deliveries = fakeDeliveries();
  api.overrides.set('PATCH /api/orders/1004/status', () => {
    // the customer cancelled the order a moment ago, so it leaves the list
    deliveries.splice(1, 2);
    return failure('A cancelled order cannot be shipped', 409);
  });
  renderShop('/deliveries');
  await user.click(await screen.findByRole('button', { name: 'Mark in transit: order #1004, Mew ex' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Order #1004: A cancelled order cannot be shipped');
  await waitFor(() => expect(orderCells()).toEqual(['#1002']));
});

test('a long delivery list has pages', async () => {
  const user = userEvent.setup();
  api.signIn(manager);
  fakeDeliveries({ totalPages: 2 });
  renderShop('/deliveries');
  expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2 of 2')).toBeTruthy();
  expect(api.calls.filter(call => call.path === '/api/deliveries').at(-1).url).toContain('page=2');
  expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
});
