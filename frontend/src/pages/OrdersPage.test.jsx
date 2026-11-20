import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';
import { App } from '../App.jsx';
import { ShopProvider } from '../state/ShopContext.jsx';
import { USER_KEY } from '../state/storage.js';

const trainer = { id: 'demo:trainer@example.com', name: 'Peko Trainer', email: 'trainer@example.com' };

function renderOrders(account) {
  if (account) sessionStorage.setItem(USER_KEY, JSON.stringify(account));
  return render(<StrictMode><MemoryRouter initialEntries={['/orders']}>
    <ShopProvider><App /></ShopProvider>
  </MemoryRouter></StrictMode>);
}

test('guests are asked to sign in to see their orders', () => {
  renderOrders(null);
  expect(screen.getByRole('heading', { name: 'Sign in to see your orders' })).toBeTruthy();
  expect(screen.queryByRole('article')).toBeNull();
});

test('the demo account sees its orders newest first with status and progress', () => {
  renderOrders(trainer);
  const orders = screen.getAllByRole('article');
  expect(orders.map(order => within(order).getByRole('heading').textContent))
    .toEqual(['Order #1003', 'Order #1002', 'Order #1001']);
  expect(within(orders[0]).getByText('This order was cancelled.')).toBeTruthy();
  expect(within(orders[1]).getByText('In transit', { selector: 'li' }).getAttribute('aria-current')).toBe('step');
  expect(within(orders[2]).getByText('Delivered', { selector: 'span' })).toBeTruthy();
  expect(within(orders[2]).getByText('$68.70')).toBeTruthy();
});

test('status filters show matching orders and an empty message', async () => {
  const user = userEvent.setup();
  renderOrders(trainer);
  await user.click(screen.getByRole('button', { name: 'Delivered' }));
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByRole('article', { name: 'Order #1001' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Processing' }));
  expect(screen.getByRole('heading', { name: 'No processing orders' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Show all orders' }));
  expect(screen.getAllByRole('article')).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
});

test('another account does not see the demo orders', () => {
  renderOrders({ id: 'demo:ash@example.com', name: 'Ash', email: 'ash@example.com' });
  expect(screen.getByRole('heading', { name: 'No orders yet' })).toBeTruthy();
});
