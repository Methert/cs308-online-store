import { expect, test, vi } from 'vitest';
import { cartTotals } from './cart.js';
import { fromServerCart } from './server-cart.js';
import { AUTH_KEY, GUEST_KEY, readGuestToken, readToken, saveGuestToken, saveToken } from './storage.js';

test('server bag prices use decimal dollars and retain quantities above stock', () => {
  const items = fromServerCart({ items: [{ productId: 173, quantity: 8, product: { id: 173, name: 'Pikachu', price: '22.50', stockQuantity: 7 } }] });
  expect(items[0]).toMatchObject({ id: 173, quantity: 8, card: { stock: 7, price: 2250 } });
  expect(cartTotals(items)).toEqual({ count: 8, cents: 18000 });
});

test('unavailable server bag is an error rather than an empty bag', () => {
  expect(() => fromServerCart({})).toThrow('incomplete bag');
  expect(fromServerCart({ items: [] })).toEqual([]);
});

test('auth tokens are kept in session storage and removed at sign-out', () => {
  saveToken('test-jwt');
  expect(readToken()).toBe('test-jwt');
  expect(localStorage.getItem(AUTH_KEY)).toBeNull();
  saveToken(null);
  expect(readToken()).toBeNull();
});

test('guest identity survives reload until a confirmed merge clears it', () => {
  saveGuestToken('guest-uuid');
  expect(readGuestToken()).toBe('guest-uuid');
  expect(localStorage.getItem(GUEST_KEY)).toBe('guest-uuid');
  saveGuestToken(null);
  expect(readGuestToken()).toBeNull();
});

test('blocked storage reports save failure without crashing startup', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  expect(saveToken('jwt')).toBe(false);
  expect(saveGuestToken('guest')).toBe(false);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  expect(readToken()).toBeNull();
  expect(readGuestToken()).toBeNull();
});
