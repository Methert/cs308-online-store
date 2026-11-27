import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { api, customer, deferred, failure } from '../test/api-fixture.js';
import { readyBag, renderShop } from '../test/render-shop.jsx';

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
