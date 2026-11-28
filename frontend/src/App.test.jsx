import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { api, customer, deferred, failure, guestId, success } from './test/api-fixture.js';
import { readyBag, renderShop } from './test/render-shop.jsx';
import { AUTH_KEY, GUEST_KEY } from './state/storage.js';

async function fillLogin(user, password = 'Customer123') {
  await user.type(await screen.findByLabelText('Email address'), customer.email);
  await user.type(screen.getByLabelText('Password', { exact: true }), password);
}

test('single-letter search uses names and descriptions require opting in', async () => {
  const user = userEvent.setup();
  renderShop();
  await readyBag(0);
  const search = screen.getByRole('searchbox', { name: 'Search cards' });
  await user.type(search, ' k ');
  expect(screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual(['Pikachu']);
  await user.clear(search);
  await user.type(search, 'rocky landscape');
  expect(screen.getByRole('heading', { name: 'No cards found' })).toBeTruthy();
  await user.click(screen.getByRole('checkbox', { name: 'Include descriptions' }));
  expect(screen.getByRole('button', { name: 'Sold out: Charmander' }).disabled).toBe(true);
});

test('rarity and price sorting still work with API products', async () => {
  const user = userEvent.setup();
  renderShop();
  await readyBag(0);
  await user.click(screen.getByRole('button', { name: 'Special illustration rare', exact: true }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort cards' }), 'low');
  expect(screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual(['Venusaur ex', 'Blastoise ex', 'Charizard ex']);
});

test('sign-in submits to auth API, displays the returned name, and restores the server bag after refresh', async () => {
  const user = userEvent.setup();
  api.guestCarts.set(guestId, [{ id: 173, quantity: 2 }]);
  api.accountCarts.set(99, [{ id: 170, quantity: 1 }]);
  const app = renderShop('/sign-in');
  await readyBag(2);
  await fillLogin(user);
  await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  expect(await screen.findByLabelText('Signed in as Demo Customer')).toBeTruthy();
  await readyBag(3);
  expect(api.calls.find(call => call.path === '/api/auth/login').body).toEqual({ email: customer.email, password: 'Customer123' });
  app.unmount();
  renderShop();
  await readyBag(3);
  await user.click(screen.getByRole('button', { name: 'Bag 3' }));
  expect(within(screen.getByRole('dialog', { name: 'Your bag' })).getByText('$79.90')).toBeTruthy();
});

test('wrong login credentials display the server error and retain the guest bag', async () => {
  const user = userEvent.setup();
  api.guestCarts.set(guestId, [{ id: 173, quantity: 1 }]);
  renderShop('/sign-in');
  await readyBag(1);
  await fillLogin(user, 'wrong');
  await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password');
  expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  expect(localStorage.getItem(GUEST_KEY)).toBe(guestId);
});

test('sign-up sends required tax ID and address, validates confirmation and uses the returned display name', async () => {
  const user = userEvent.setup();
  renderShop('/sign-up');
  await readyBag(0);
  await user.type(screen.getByLabelText('Display name'), '<b>Yavuz</b>');
  await user.type(screen.getByLabelText('Email address'), 'yavuz@example.test');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'School123');
  await user.type(screen.getByLabelText('Confirm password'), 'Different123');
  await user.type(screen.getByLabelText('Tax ID'), '12345678901');
  await user.type(screen.getByLabelText('Home address'), '12 Sample Street');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByText('Your passwords do not match.')).toBeTruthy();
  expect(api.calls.some(call => call.path === '/api/auth/register')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Show', exact: true }));
  expect(screen.getByLabelText('Confirm password').type).toBe('text');
  await user.clear(screen.getByLabelText('Confirm password'));
  await user.type(screen.getByLabelText('Confirm password'), 'School123');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect((await screen.findByLabelText('Signed in as <b>Yavuz</b>')).textContent).toBe('<b>Yavuz</b>');
  expect(api.calls.find(call => call.path === '/api/auth/register').body).toEqual({
    name: '<b>Yavuz</b>', email: 'yavuz@example.test', password: 'School123', taxId: '12345678901', homeAddress: '12 Sample Street',
  });
});

test('server validation errors appear beside their sign-up fields', async () => {
  const user = userEvent.setup();
  api.overrides.set('POST /api/auth/register', failure('Validation failed', 400, [{ field: 'taxId', message: 'Tax ID was rejected' }]));
  renderShop('/sign-up');
  await readyBag(0);
  for (const [label, value] of [['Display name', 'Yavuz'], ['Email address', 'new@example.test'], ['Password', 'School123'], ['Confirm password', 'School123'], ['Tax ID', '12345678901'], ['Home address', '12 Sample Street']]) {
    await user.type(screen.getByLabelText(label, { exact: true }), value);
  }
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByText('Tax ID was rejected')).toBeTruthy();
  expect(screen.getByLabelText('Tax ID').getAttribute('aria-invalid')).toBe('true');
});

test('pending auth disables repeat submission and recovers after a network error', async () => {
  const user = userEvent.setup();
  const held = deferred();
  api.overrides.set('POST /api/auth/login', () => held.promise);
  renderShop('/sign-in');
  await readyBag(0);
  await fillLogin(user);
  await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  expect(screen.getByRole('button', { name: 'Signing in...' }).disabled).toBe(true);
  expect(api.calls.filter(call => call.path === '/api/auth/login')).toHaveLength(1);
  await act(async () => { held.reject(new TypeError('Offline')); });
  expect((await screen.findByRole('alert')).textContent).toContain('could not be reached');
  expect(screen.getByRole('button', { name: 'Sign in', exact: true }).disabled).toBe(false);
});

test('bag loading and errors do not show a misleading empty state and can be retried', async () => {
  const user = userEvent.setup();
  const held = deferred();
  api.overrides.set('GET /api/cart', () => held.promise);
  renderShop();
  await user.click(screen.getByRole('button', { name: 'Bag ...' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Your bag' }));
  expect(dialog.getByText('Loading your bag...')).toBeTruthy();
  expect(dialog.queryByText('Your bag is empty')).toBeNull();
  await act(async () => { held.resolve(failure('Server unavailable', 503)); });
  expect(await dialog.findByRole('alert')).toBeTruthy();
  expect(dialog.queryByText('Your bag is empty')).toBeNull();
  api.overrides.delete('GET /api/cart');
  await user.click(dialog.getByRole('button', { name: 'Reload bag' }));
  expect(await dialog.findByText('Your bag is empty')).toBeTruthy();
});

test('failed additions show an error without claiming success', async () => {
  const user = userEvent.setup();
  api.overrides.set('POST /api/cart/items', failure('Not enough stock', 409));
  renderShop();
  await readyBag(0);
  await user.click(screen.getByRole('button', { name: 'Add to bag: Pikachu' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Not enough stock');
  expect(screen.queryByText('Card added to your bag.')).toBeNull();
  await readyBag(0);
});

test('merged stock conflicts stay visible and checkout is withheld until the customer fixes them', async () => {
  const user = userEvent.setup();
  api.signIn();
  api.accountCarts.set(99, [{ id: 173, quantity: 9 }]);
  renderShop();
  await readyBag(9);
  await user.click(screen.getByRole('button', { name: 'Bag 9' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Your bag' }));
  expect(dialog.getByText('Only 7 available. Reduce this quantity before checkout.')).toBeTruthy();
  expect(dialog.queryByRole('link', { name: 'Go to checkout' })).toBeNull();
  await user.click(dialog.getByRole('button', { name: 'Reduce to 7' }));
  await readyBag(7);
  expect(dialog.getByRole('link', { name: 'Go to checkout' })).toBeTruthy();
  await user.click(dialog.getByRole('button', { name: 'Remove Pikachu' }));
  expect(await dialog.findByText('Your bag is empty')).toBeTruthy();
});

test('failed merge provides an explicit retry while keeping sign-in successful', async () => {
  const user = userEvent.setup();
  api.overrides.set('POST /api/cart/merge', failure('Unavailable', 503));
  renderShop('/sign-in');
  await readyBag(0);
  await fillLogin(user);
  await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  expect(await screen.findByLabelText('Signed in as Demo Customer')).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Retry combining bags' })).toBeTruthy();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry combining bags' }).disabled).toBe(false));
  api.overrides.delete('POST /api/cart/merge');
  await user.click(screen.getByRole('button', { name: 'Retry combining bags' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry combining bags' })).toBeNull());
});

test('missing card detail shows availability feedback rather than stale product actions', async () => {
  const user = userEvent.setup();
  api.overrides.set('GET /api/products/173', failure('Product not found', 404));
  renderShop();
  await readyBag(0);
  await user.click(screen.getByRole('button', { name: 'View Pikachu details' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Pikachu' }));
  expect(await dialog.findByText('This card is no longer available.')).toBeTruthy();
  expect(dialog.queryByRole('button', { name: 'Add to bag: Pikachu' })).toBeNull();
});
