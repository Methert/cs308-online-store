import { StrictMode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../App.jsx';
import { defaultInventory, readInventory, saveInventory } from '../state/inventory.js';
import { ORDERS_KEY } from '../state/orders.js';
import { ShopProvider } from '../state/ShopContext.jsx';
import { CART_KEY, USER_KEY } from '../state/storage.js';
import { BANK_DELAY } from './CheckoutPage.jsx';

const trainer = { id: 'demo:trainer@example.com', name: 'Peko Trainer', email: 'trainer@example.com' };

function renderStore(path = '/checkout') {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}>
    <ShopProvider><App /></ShopProvider>
  </MemoryRouter></StrictMode>);
}

// signed in with two Pikachu cards ($45.00) in the bag
function startCheckout() {
  sessionStorage.setItem(USER_KEY, JSON.stringify(trainer));
  localStorage.setItem(CART_KEY, JSON.stringify([{ id: 173, quantity: 2 }]));
  renderStore();
}

async function fillForm(user, cardNumber) {
  await user.type(screen.getByLabelText('Full name'), 'Peko Trainer');
  await user.type(screen.getByLabelText('Address'), '12 Sample Street');
  await user.type(screen.getByLabelText('City'), 'Istanbul');
  await user.type(screen.getByLabelText('Postal code'), '34710');
  await user.type(screen.getByLabelText('Name on card'), 'Peko Trainer');
  await user.type(screen.getByLabelText('Card number'), cardNumber);
  await user.type(screen.getByLabelText('Expiry date'), '1230');
  await user.type(screen.getByLabelText('CVV'), '123');
}

// the fake bank waits with setTimeout, so these tests control the clock
function useBankClock() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
  return userEvent.setup({ advanceTimers: ms => vi.advanceTimersByTime(ms) });
}

function waitForBank() {
  act(() => {
    vi.advanceTimersByTime(BANK_DELAY);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

test('guests are asked to sign in before paying and keep their bag', () => {
  localStorage.setItem(CART_KEY, JSON.stringify([{ id: 173, quantity: 1 }]));
  renderStore();
  const main = within(screen.getByRole('main'));
  expect(main.getByRole('heading', { name: 'Sign in to place your order' })).toBeTruthy();
  expect(main.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in');
  expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Bag 1' })).toBeTruthy();
});

test('an empty bag has nothing to pay for', () => {
  sessionStorage.setItem(USER_KEY, JSON.stringify(trainer));
  renderStore();
  const main = within(screen.getByRole('main'));
  expect(main.getByRole('heading', { name: 'Your bag is empty' })).toBeTruthy();
  expect(main.getByRole('link', { name: 'Browse cards' }).getAttribute('href')).toBe('/');
});

test('the bag links to checkout', async () => {
  const user = userEvent.setup();
  sessionStorage.setItem(USER_KEY, JSON.stringify(trainer));
  localStorage.setItem(CART_KEY, JSON.stringify([{ id: 173, quantity: 1 }]));
  renderStore('/');
  await user.click(screen.getByRole('button', { name: 'Bag 1' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Your bag' })).getByRole('link', { name: 'Go to checkout' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Checkout' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pay $22.50' })).toBeTruthy();
  expect(document.querySelector('.cart-dialog').hasAttribute('open')).toBe(false);
});

test('wrong details are shown next to the fields and the bank is not contacted', async () => {
  const user = userEvent.setup();
  startCheckout();
  await user.type(screen.getByLabelText('Card number'), '4242abc4242');
  expect(screen.getByLabelText('Card number').value).toBe('4242 4242');
  await user.click(screen.getByRole('button', { name: 'Pay $45.00' }));
  expect(screen.getByText('Enter your full name.')).toBeTruthy();
  expect(screen.getByText('Postal code must be 5 digits.')).toBeTruthy();
  expect(screen.getByText('Enter a valid 16-digit card number.')).toBeTruthy();
  expect(screen.getByText('CVV must be 3 digits.')).toBeTruthy();
  expect(screen.getByLabelText('Full name').getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(screen.getByLabelText('Full name'));
  expect(screen.queryByText('Contacting your bank…')).toBeNull();
});

test('checkout stops when the store has fewer cards than the bag', async () => {
  const user = userEvent.setup();
  saveInventory(defaultInventory.map(product => (product.id === 173 ? { ...product, stock: 1 } : product)));
  startCheckout();
  await fillForm(user, '4242424242424242');
  await user.click(screen.getByRole('button', { name: 'Pay $45.00' }));
  expect(screen.getByRole('alert').textContent).toBe('Only 1 left of Pikachu. Please update your bag.');
  expect(screen.queryByText('Contacting your bank…')).toBeNull();
});

test('declined cards keep the bag and the address so another card can be tried', async () => {
  const user = useBankClock();
  startCheckout();
  await fillForm(user, '4000000000000002');
  await user.click(screen.getByRole('button', { name: 'Pay $45.00' }));
  waitForBank();
  expect(screen.getByRole('heading', { name: 'Payment declined' })).toBeTruthy();
  expect(screen.getByText('Your card was declined.', { exact: false })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Bag 2' })).toBeTruthy();
  expect(localStorage.getItem(ORDERS_KEY)).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Try another card' }));
  expect(screen.getByLabelText('Full name').value).toBe('Peko Trainer');
  expect(screen.getByLabelText('Postal code').value).toBe('34710');
  expect(screen.getByLabelText('Card number').value).toBe('');
  expect(document.activeElement).toBe(screen.getByLabelText('Card number'));

  await user.type(screen.getByLabelText('Card number'), '4000000000009995');
  await user.type(screen.getByLabelText('Expiry date'), '1230');
  await user.type(screen.getByLabelText('CVV'), '123');
  await user.click(screen.getByRole('button', { name: 'Pay $45.00' }));
  waitForBank();
  expect(screen.getByText('Insufficient funds.', { exact: false })).toBeTruthy();
  expect(readInventory().find(product => product.id === 173).stock).toBe(7);
});

test('an approved payment saves the order, lowers the stock and empties the bag', async () => {
  const user = useBankClock();
  startCheckout();
  await fillForm(user, '4242424242424242');
  await user.click(screen.getByRole('button', { name: 'Pay $45.00' }));
  expect(screen.getByText('Contacting your bank…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pay $45.00' }).disabled).toBe(true);
  waitForBank();

  expect(screen.getByRole('heading', { name: 'Payment approved' })).toBeTruthy();
  expect(screen.getByText('Pikachu × 2')).toBeTruthy();
  expect(screen.getByText('Paid on Nov 20, 2026 with the card ending in 4242')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Bag 0' })).toBeTruthy();
  expect(readInventory().find(product => product.id === 173).stock).toBe(5);
  const order = JSON.parse(localStorage.getItem(ORDERS_KEY)).find(order => order.id === 1004);
  expect(order).toMatchObject({ userId: trainer.id, status: 'processing', total: 4500, cardLast4: '4242' });
  expect(localStorage.getItem(ORDERS_KEY)).not.toContain('4242424242424242');

  await user.click(screen.getByRole('link', { name: 'View my orders' }));
  const newOrder = screen.getByRole('article', { name: 'Order #1004' });
  expect(newOrder.className).toContain('new-order');
  expect(within(newOrder).getByText('Processing', { selector: 'li' }).getAttribute('aria-current')).toBe('step');
});
