import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { api, failure, guestId } from '../test/api-fixture.js';
import { readyBag, renderShop } from '../test/render-shop.jsx';

async function fillForm(user) {
  for (const [label, value] of [['Full name', 'Demo Customer'], ['Address', '12 Sample Street'], ['City', 'Istanbul'], ['Postal code', '34710'], ['Name on card', 'Demo Customer'], ['Card number', '4242424242424242'], ['Expiry date', '1230'], ['CVV', '123']]) {
    await user.type(screen.getByLabelText(label), value);
  }
}

function signedInCheckout() {
  api.signIn();
  api.accountCarts.set(99, [{ id: 173, quantity: 2 }]);
  return renderShop('/checkout');
}

test('guest checkout links to auth without losing its server bag', async () => {
  api.guestCarts.set(guestId, [{ id: 173, quantity: 1 }]);
  renderShop('/checkout');
  await readyBag(1);
  expect(screen.getByRole('heading', { name: 'Sign in to place your order' })).toBeTruthy();
  expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in');
});

test('an actual empty bag shows no payment form', async () => {
  api.signIn();
  renderShop('/checkout');
  expect(await screen.findByRole('heading', { name: 'Your bag is empty' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
});

test('wrong checkout fields remain inline and do not create an order', async () => {
  const user = userEvent.setup();
  signedInCheckout();
  await readyBag(2);
  await user.click(screen.getByRole('button', { name: 'Pay $45.00' }));
  expect(screen.getByText('Postal code must be 5 digits.')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText('Full name'));
  expect(api.calls.some(call => call.path === '/api/orders' && call.method === 'POST')).toBe(false);
});

test('order submission uses the server cart and shows confirmation only after server success', async () => {
  const user = userEvent.setup();
  signedInCheckout();
  await readyBag(2);
  await fillForm(user);
  await user.click(screen.getByRole('button', { name: 'Pay $45.00' }));
  expect(await screen.findByRole('heading', { name: 'Payment approved' })).toBeTruthy();
  const call = api.calls.find(call => call.path === '/api/orders' && call.method === 'POST');
  expect(call.body).toEqual({ deliveryAddress: 'Demo Customer, 12 Sample Street, Istanbul 34710', paymentInfo: { cardHolder: 'Demo Customer', cardNumber: '4242424242424242' } });
  expect(JSON.stringify(call.body)).not.toContain('cvv');
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('4242424242424242');
  await readyBag(0);
  expect(api.accountCarts.get(99)).toEqual([]);
  expect(api.calls.some(call => call.method === 'DELETE' && call.path.startsWith('/api/cart'))).toBe(false);
  await user.click(screen.getByRole('link', { name: 'View my orders' }));
  expect((await screen.findByRole('article', { name: 'Order #1004' })).className).toContain('new-order');
});

test('stock failure leaves the server bag intact and gives a useful error', async () => {
  const user = userEvent.setup();
  api.overrides.set('POST /api/orders', failure('Pikachu ran out of stock', 409));
  signedInCheckout();
  await readyBag(2);
  await fillForm(user);
  await user.click(screen.getByRole('button', { name: 'Pay $45.00' }));
  expect((await screen.findByRole('alert')).textContent).toContain('ran out of stock');
  expect(screen.queryByRole('heading', { name: 'Payment approved' })).toBeNull();
  await readyBag(2);
  expect(api.accountCarts.get(99)).toEqual([{ id: 173, quantity: 2 }]);
});

test('login from checkout returns to checkout after merging the guest bag', async () => {
  const user = userEvent.setup();
  api.guestCarts.set(guestId, [{ id: 173, quantity: 1 }]);
  renderShop('/checkout');
  await readyBag(1);
  await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' }));
  await user.type(await screen.findByLabelText('Email address'), 'customer@pokeshop.test');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'Customer123');
  await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pay $22.50' })).toBeTruthy());
});
