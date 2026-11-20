import { describe, expect, test, vi } from 'vitest';
import { cartTotals, changeQuantity, normalizeCart } from './cart.js';
import { CART_KEY, readCart, readUser, saveCart, saveUser, USER_KEY } from './storage.js';

describe('cart restoration and quantities', () => {
  test('reload restores quantities and derives the subtotal from current prices', () => {
    const items = [{ id: 173, quantity: 2 }, { id: 170, quantity: 1 }];
    expect(saveCart(items)).toBe(true);
    expect(readCart()).toEqual(items);
    expect(cartTotals(readCart())).toEqual({ count: 3, cents: 7990 });
    expect(JSON.parse(localStorage.getItem(CART_KEY))).toEqual(items);
  });

  test('restoration caps stock and discards unknown, sold-out and invalid entries', () => {
    expect(normalizeCart([
      { id: 200, quantity: 99, price: 1 },
      { id: 168, quantity: 1 }, { id: 999, quantity: 1 },
      { id: 173, quantity: -2 }, { id: 170, quantity: 1.5 }, null,
    ])).toEqual([{ id: 200, quantity: 1 }]);
  });

  test('duplicate saved rows cannot inflate stock limits', () => {
    expect(normalizeCart([{ id: 200, quantity: 5 }, { id: 200, quantity: 4 }]))
      .toEqual([{ id: 200, quantity: 1 }]);
  });

  test('malformed or incompatible saved data gives a usable empty cart', () => {
    for (const value of ['{broken', 'null', '{"items":[]}', '123']) {
      localStorage.setItem(CART_KEY, value);
      expect(readCart()).toEqual([]);
    }
  });

  test('removing the last item clears the saved cart', () => {
    saveCart([{ id: 173, quantity: 1 }]);
    saveCart(changeQuantity(readCart(), 173, -1));
    expect(localStorage.getItem(CART_KEY)).toBeNull();
    expect(readCart()).toEqual([]);
  });

  test('stock limits and invalid changes preserve existing quantities', () => {
    const items = [{ id: 200, quantity: 1 }];
    expect(changeQuantity(items, 200, 1)).toBe(items);
    expect(changeQuantity(items, 200, -2)).toBe(items);
    expect(changeQuantity(items, 999, 1)).toBe(items);
    expect(changeQuantity(items, 173, 1.5)).toBe(items);
  });

  test('blocked storage reports save failure and safely handles reads', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(saveCart([{ id: 173, quantity: 1 }])).toBe(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(readCart()).toEqual([]);
  });
});

describe('demo session compatibility', () => {
  test('restores the previous prototype display-name format', () => {
    sessionStorage.setItem(USER_KEY, JSON.stringify({ displayName: 'Yavuz' }));
    expect(readUser()?.name).toBe('Yavuz');
  });

  test('saves the public user fields and removes them on sign-out', () => {
    const user = { id: 'demo:trainer@example.com', name: 'Trainer', email: 'trainer@example.com' };
    expect(saveUser(user)).toBe(true);
    expect(readUser()).toEqual(user);
    saveUser(null);
    expect(readUser()).toBeNull();
  });

  test('corrupt or empty user data returns a guest session', () => {
    for (const value of ['{broken', 'null', '{"name":"  "}']) {
      sessionStorage.setItem(USER_KEY, value);
      expect(readUser()).toBeNull();
    }
  });
});
