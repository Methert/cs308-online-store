import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api, customer, deferred, failure, success } from '../test/api-fixture.js';
import { readyBag, renderShop } from '../test/render-shop.jsx';

// the sample orders are delivered, in transit and cancelled, so add one that can still be cancelled
function addProcessingOrder() {
  api.orders.push({ id: 1004, userId: 99, status: 'processing', createdAt: '2026-11-20T10:00:00Z', totalPrice: 22.50, deliveryAddress: '12 Sample Street, Istanbul 34710',
    items: [{ id: 505, productId: 173, quantity: 1, unitPrice: 22.50, product: { name: 'Pikachu' } }] });
}

test('guests are asked to sign in and no private orders are requested', async () => {
  renderShop('/orders');
  await readyBag(0);
  expect(screen.getByRole('heading', { name: 'Sign in to see your orders' })).toBeTruthy();
  expect(api.calls.some(call => call.path === '/api/orders')).toBe(false);
});

test('order loading does not briefly show an empty history', async () => {
  api.signIn();
  api.overrides.set('GET /api/orders', () => deferred().promise);
  renderShop('/orders');
  await readyBag(0);
  expect(screen.getByText('Loading your orders...')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'No orders yet' })).toBeNull();
});

test('API orders are shown newest first with server status and decimal totals', async () => {
  api.signIn();
  renderShop('/orders');
  const orders = await screen.findAllByRole('article');
  expect(orders.map(order => within(order).getByRole('heading').textContent)).toEqual(['Order #1003', 'Order #1002', 'Order #1001']);
  expect(within(orders[0]).getByText('This order was cancelled.')).toBeTruthy();
  expect(within(orders[1]).getByText('In transit', { selector: 'li' }).getAttribute('aria-current')).toBe('step');
  expect(within(orders[2]).getByText('$68.70')).toBeTruthy();
  expect(api.calls.find(call => call.path === '/api/orders').options.headers.Authorization).toBe('Bearer token:99');
});

test('status filters distinguish no matching orders from an empty history', async () => {
  const user = userEvent.setup();
  api.signIn();
  renderShop('/orders');
  await screen.findAllByRole('article');
  await user.click(screen.getByRole('button', { name: 'Delivered', exact: true }));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Processing', exact: true }));
  expect(screen.getByRole('heading', { name: 'No processing orders' })).toBeTruthy();
});

test('failed order request has a retry and never displays sample history', async () => {
  const user = userEvent.setup();
  api.signIn();
  api.overrides.set('GET /api/orders', failure('Unavailable', 503));
  renderShop('/orders');
  expect((await screen.findByRole('alert')).textContent).toContain('Your orders could not be loaded');
  expect(screen.queryByRole('article')).toBeNull();
  api.overrides.delete('GET /api/orders');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findAllByRole('article')).toHaveLength(3);
});

test('a different account sees only its actual empty server history', async () => {
  api.signIn({ ...customer, id: 101, name: 'Other customer' });
  renderShop('/orders');
  expect(await screen.findByRole('heading', { name: 'No orders yet' })).toBeTruthy();
  expect(screen.queryByRole('article')).toBeNull();
});

test('only a processing order can be cancelled and it asks first', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  api.signIn();
  addProcessingOrder();
  api.overrides.set('PUT /api/orders/1004/cancel', success({ id: 1004, userId: 99, status: 'cancelled' }));
  renderShop('/orders');
  const order = await screen.findByRole('article', { name: 'Order #1004' });
  expect(screen.getAllByRole('button', { name: /^Cancel order/ })).toHaveLength(1);

  await user.click(within(order).getByRole('button', { name: 'Cancel order #1004' }));
  expect(api.calls.some(call => call.method === 'PUT')).toBe(false);
  await user.click(within(order).getByRole('button', { name: 'Cancel order #1004' }));
  expect(await within(order).findByText('This order was cancelled.')).toBeTruthy();
  expect(within(order).getByText('Cancelled', { selector: 'span' })).toBeTruthy();
  expect(within(order).queryByRole('button', { name: 'Cancel order #1004' })).toBeNull();
  // the product dialog repeats the same message, so look at the toast only
  await waitFor(() => expect(document.querySelector('.toast').textContent).toBe('Order #1004 was cancelled.'));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(api.calls.find(call => call.method === 'PUT').options.headers.Authorization).toBe('Bearer token:99');
});

test('a cancel that comes too late shows the reason and the real status', async () => {
  const user = userEvent.setup();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.signIn();
  addProcessingOrder();
  // the product manager shipped the order while the customer was looking at the page
  api.overrides.set('PUT /api/orders/1004/cancel', () => {
    api.orders.find(order => order.id === 1004).status = 'in_transit';
    return failure('Only orders with status "processing" can be cancelled', 409);
  });
  renderShop('/orders');
  await user.click(await screen.findByRole('button', { name: 'Cancel order #1004' }));
  // the list is loaded again, so wait until the new status is shown
  await waitFor(() => {
    const order = screen.getByRole('article', { name: 'Order #1004' });
    expect(within(order).getByText('In transit', { selector: 'li' }).getAttribute('aria-current')).toBe('step');
  });
  const order = screen.getByRole('article', { name: 'Order #1004' });
  expect(within(order).getByRole('alert').textContent).toBe('Only orders with status "processing" can be cancelled');
  expect(within(order).queryByRole('button', { name: 'Cancel order #1004' })).toBeNull();
});
