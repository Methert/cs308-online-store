import { expect, test, vi } from 'vitest';
import { createShopSession } from './session.js';
import { AUTH_KEY, GUEST_KEY } from './storage.js';
import { api, customer, deferred, failure, guestId, success } from '../test/api-fixture.js';

const login = { email: customer.email, password: 'Customer123' };
const mutations = () => api.calls.filter(call => call.method !== 'GET');
async function start() { const shop = createShopSession(); await shop.start(); return shop; }

test('a refreshed guest loads the bag from the server with the same guest identity', async () => {
  api.guestCarts.set(guestId, [{ id: 173, quantity: 2 }]);
  const shop = await start();
  expect(shop.getSnapshot().cart).toMatchObject([{ id: 173, quantity: 2 }]);
  expect(api.calls[0].options.headers['x-guest-token']).toBe(guestId);
  expect(api.calls[0].options.headers.Authorization).toBeUndefined();
});

test('successful add, update and removal are saved on the server before UI confirmation', async () => {
  const shop = await start();
  await shop.updateQuantity(173, 1);
  await shop.updateQuantity(173, 1);
  expect(api.guestCarts.get(guestId)).toEqual([{ id: 173, quantity: 2 }]);
  expect(mutations().map(call => [call.method, call.body])).toEqual([
    ['POST', { productId: 173, quantity: 1 }], ['PUT', { quantity: 2 }],
  ]);
  await shop.updateQuantity(173, -2);
  expect(mutations().at(-1).method).toBe('DELETE');
  expect((await start()).getSnapshot().cart).toEqual([]);
});

test('sign-in merges the guest bag with an existing account bag once', async () => {
  api.guestCarts.set(guestId, [{ id: 173, quantity: 2 }, { id: 170, quantity: 1 }]);
  api.accountCarts.set(customer.id, [{ id: 173, quantity: 1 }, { id: 193, quantity: 1 }]);
  const shop = await start();
  await shop.signIn(login);
  expect(shop.getSnapshot().cart).toMatchObject([{ id: 173, quantity: 3 }, { id: 193, quantity: 1 }, { id: 170, quantity: 1 }]);
  expect(api.calls.filter(call => call.path === '/api/cart/merge')).toHaveLength(1);
  expect(localStorage.getItem(GUEST_KEY)).toBeNull();
  expect(sessionStorage.getItem(AUTH_KEY)).toBe('token:99');
  const refreshed = await start();
  expect(refreshed.getSnapshot().user.name).toBe('Demo Customer');
  expect(refreshed.getSnapshot().cart[0].quantity).toBe(3);
  expect(api.calls.filter(call => call.path === '/api/cart/merge')).toHaveLength(1);
});

test('registration uses the server user and combines the guest bag', async () => {
  api.guestCarts.set(guestId, [{ id: 170, quantity: 1 }]);
  const shop = await start();
  const fields = { ...login, name: 'Yavuz', taxId: '12345678901', homeAddress: 'Sample address' };
  await shop.signUp(fields);
  expect(shop.getSnapshot().user).toMatchObject({ id: 100, name: 'Yavuz' });
  expect(shop.getSnapshot().cart).toMatchObject([{ id: 170, quantity: 1 }]);
  expect(api.calls.find(call => call.path === '/api/auth/register').body).toEqual(fields);
  expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(fields.password);
});

test('invalid credentials leave the guest bag and identity intact', async () => {
  api.guestCarts.set(guestId, [{ id: 173, quantity: 2 }]);
  const shop = await start();
  await expect(shop.signIn({ ...login, password: 'wrong' })).rejects.toMatchObject({ status: 401 });
  expect(shop.getSnapshot()).toMatchObject({ user: null, cart: [{ id: 173, quantity: 2 }] });
  expect(localStorage.getItem(GUEST_KEY)).toBe(guestId);
  expect(api.calls.some(call => call.path === '/api/cart/merge')).toBe(false);
});

test('merge failure retains the guest token, shows the account bag and blocks writes until retry', async () => {
  api.guestCarts.set(guestId, [{ id: 173, quantity: 2 }]);
  api.accountCarts.set(customer.id, [{ id: 193, quantity: 1 }]);
  api.overrides.set('POST /api/cart/merge', failure('Server unavailable', 503));
  const shop = await start();
  expect(await shop.signIn(login)).toBe(true);
  expect(shop.getSnapshot()).toMatchObject({ user: customer, mergePending: true, cart: [{ id: 193, quantity: 1 }] });
  expect(localStorage.getItem(GUEST_KEY)).toBe(guestId);
  expect(await shop.updateQuantity(193, 1)).toBe(false);
  api.overrides.delete('POST /api/cart/merge');
  await shop.retryCart();
  expect(shop.getSnapshot().mergePending).toBe(false);
  expect(shop.getSnapshot().cart).toHaveLength(2);
  expect(localStorage.getItem(GUEST_KEY)).toBeNull();
});

test('a consumed merge can be retried after a lost response without duplicating items', async () => {
  api.guestCarts.set(guestId, [{ id: 173, quantity: 2 }]);
  api.overrides.set('POST /api/cart/merge', () => {
    api.accountCarts.set(99, [{ id: 173, quantity: 2 }]);
    api.guestCarts.delete(guestId);
    throw new TypeError('Connection lost after commit');
  });
  const shop = await start();
  await shop.signIn(login);
  api.overrides.delete('POST /api/cart/merge');
  await shop.retryCart();
  expect(shop.getSnapshot().cart[0].quantity).toBe(2);
});

test('startup sharing prevents duplicate merges under StrictMode', async () => {
  api.signIn();
  const held = deferred();
  api.overrides.set('POST /api/cart/merge', () => held.promise);
  const shop = createShopSession();
  const first = shop.start();
  const second = shop.start();
  expect(second).toBe(first);
  await vi.waitFor(() => expect(api.calls.filter(call => call.path === '/api/cart/merge')).toHaveLength(1));
  held.resolve(success({ merged: 0 }));
  await first;
  expect(shop.getSnapshot().cartBusy).toBe(false);
});

test('merged quantities above stock are never silently capped in the frontend', async () => {
  api.guestCarts.set(guestId, [{ id: 173, quantity: 4 }]);
  api.accountCarts.set(99, [{ id: 173, quantity: 5 }]);
  const shop = await start();
  await shop.signIn(login);
  expect(shop.getSnapshot().cart[0]).toMatchObject({ quantity: 9, card: { stock: 7 } });
});

test('sign-out clears the token and visible account bag without deleting the server bag', async () => {
  api.signIn();
  api.accountCarts.set(99, [{ id: 173, quantity: 2 }]);
  const shop = await start();
  await shop.signOut();
  expect(shop.getSnapshot()).toMatchObject({ user: null, cart: [] });
  expect(api.accountCarts.get(99)).toEqual([{ id: 173, quantity: 2 }]);
  expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  await shop.signIn(login);
  expect(shop.getSnapshot().cart[0].quantity).toBe(2);
});

test('expired startup token is removed and the guest bag is restored', async () => {
  sessionStorage.setItem(AUTH_KEY, 'expired');
  api.guestCarts.set(guestId, [{ id: 173, quantity: 1 }]);
  const shop = await start();
  expect(shop.getSnapshot()).toMatchObject({ user: null, authStatus: 'ready', cart: [{ id: 173, quantity: 1 }] });
  expect(shop.getSnapshot().message).toContain('expired');
  expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
});

test('account-check outages retain the token and show a retry instead of silently logging out', async () => {
  api.signIn();
  api.overrides.set('GET /api/auth/me', failure('Unavailable', 503));
  const shop = await start();
  expect(shop.getSnapshot().authStatus).toBe('error');
  expect(sessionStorage.getItem(AUTH_KEY)).toBe('token:99');
  expect(api.calls.some(call => call.path === '/api/cart')).toBe(false);
  api.overrides.delete('GET /api/auth/me');
  await shop.retrySession();
  expect(shop.getSnapshot().user).toEqual(customer);
});

test('failed bag reads are visible errors and never successful empty bags', async () => {
  api.overrides.set('GET /api/cart', failure('Unavailable', 503));
  const shop = await start();
  expect(shop.getSnapshot()).toMatchObject({ cartStatus: 'error', cartError: 'Unavailable' });
  expect(await shop.updateQuantity(173, 1)).toBe(false);
  api.overrides.delete('GET /api/cart');
  await shop.retryCart();
  expect(shop.getSnapshot().cartStatus).toBe('ready');
});

test('failed writes keep the last server-confirmed quantities without a success toast', async () => {
  const shop = await start();
  api.overrides.set('POST /api/cart/items', failure('Not enough stock', 409));
  expect(await shop.updateQuantity(173, 1)).toBe(false);
  expect(shop.getSnapshot().cart).toEqual([]);
  expect(shop.getSnapshot().cartError).toContain('Not enough stock');
  expect(shop.getSnapshot().message).toBe('');
});

test('repeated clicks while a write is pending do not send duplicate additions', async () => {
  const shop = await start();
  const held = deferred();
  api.overrides.set('POST /api/cart/items', () => held.promise);
  const first = shop.updateQuantity(173, 1);
  expect(await shop.updateQuantity(173, 1)).toBe(false);
  expect(mutations()).toHaveLength(1);
  api.guestCarts.set(guestId, [{ id: 173, quantity: 1 }]);
  held.resolve(success({}, 201));
  await first;
  expect(shop.getSnapshot().cart[0].quantity).toBe(1);
});

test('responses for a signed-out account cannot replace the new guest bag', async () => {
  api.signIn();
  const shop = await start();
  const held = deferred();
  api.overrides.set('GET /api/cart', ({ user }) => user ? held.promise : success({ items: [] }));
  const old = shop.refreshCart();
  await shop.signOut();
  held.resolve(success({ items: [{ productId: 173, quantity: 5, product: api.products[1] }] }));
  await old;
  expect(shop.getSnapshot()).toMatchObject({ user: null, cart: [] });
});

test('401 during an authenticated action expires the session and hides private cart data', async () => {
  api.signIn();
  const shop = await start();
  api.users.delete('token:99');
  await expect(shop.authorizedRequest('/orders')).rejects.toMatchObject({ status: 401 });
  expect(shop.getSnapshot()).toMatchObject({ user: null, cart: [] });
  expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
});

test('same-owner cross-tab notifications reload the bag without merging again', async () => {
  const shop = await start();
  api.guestCarts.set(guestId, [{ id: 170, quantity: 1 }]);
  await shop.onBagEvent({ newValue: JSON.stringify({ owner: guestId }) });
  expect(shop.getSnapshot().cart[0].id).toBe(170);
  const before = api.calls.length;
  await shop.onBagEvent({ newValue: JSON.stringify({ owner: 'some-other-account' }) });
  expect(api.calls).toHaveLength(before);
});

test('two tabs restoring the same guest identity serialize the merge and consume it once', async () => {
  let queued = Promise.resolve();
  vi.stubGlobal('navigator', { locks: { request: (name, work) => {
    const result = queued.then(work);
    queued = result.catch(() => {});
    return result;
  } } });
  api.signIn();
  api.guestCarts.set(guestId, [{ id: 173, quantity: 2 }]);
  const first = createShopSession();
  const second = createShopSession();
  await Promise.all([first.start(), second.start()]);
  expect(api.calls.filter(call => call.path === '/api/cart/merge')).toHaveLength(1);
  expect(first.getSnapshot().cart[0].quantity).toBe(2);
  expect(second.getSnapshot().cart[0].quantity).toBe(2);
});

test('a guest tab replaces an identity consumed by another tab before accepting another write', async () => {
  api.guestCarts.set(guestId, [{ id: 173, quantity: 1 }]);
  const shop = await start();
  localStorage.removeItem(GUEST_KEY);
  expect(await shop.updateQuantity(173, 1)).toBe(false);
  expect(shop.getSnapshot().cart).toEqual([]);
  expect(localStorage.getItem(GUEST_KEY)).not.toBe(guestId);
  expect(mutations()).toEqual([]);
});
