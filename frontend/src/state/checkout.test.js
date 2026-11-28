import { describe, expect, test } from 'vitest';
import {
  bankDecision, checkStock, createOrder, emptyCheckout, formatCardNumber, formatExpiry,
  isValidCardNumber, isValidCvv, isValidExpiry, nextOrderId, validateCheckout,
} from './checkout.js';

// 20 November 2026
const today = new Date(2026, 10, 20);

const goodForm = {
  fullName: 'Peko Trainer',
  address: '12 Sample Street',
  city: 'Istanbul',
  postalCode: '34710',
  cardName: 'Peko Trainer',
  cardNumber: '4242 4242 4242 4242',
  expiry: '12/27',
  cvv: '123',
};

describe('card fields', () => {
  test('card number and expiry are formatted while typing', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('4242-42ab42 42424242424299')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('424')).toBe('424');
    expect(formatExpiry('1')).toBe('1');
    expect(formatExpiry('12/2')).toBe('12/2');
    expect(formatExpiry('1227')).toBe('12/27');
  });

  test('card numbers need 16 digits and a correct check digit', () => {
    expect(isValidCardNumber('4242 4242 4242 4242')).toBe(true);
    expect(isValidCardNumber('4000 0000 0000 0002')).toBe(true);
    expect(isValidCardNumber('4242 4242 4242 4241')).toBe(false);
    expect(isValidCardNumber('4242 4242 4242')).toBe(false);
    expect(isValidCardNumber('')).toBe(false);
  });

  test('the expiry date can be this month or later', () => {
    expect(isValidExpiry('11/26', today)).toBe(true);
    expect(isValidExpiry('01/27', today)).toBe(true);
    expect(isValidExpiry('10/26', today)).toBe(false);
    expect(isValidExpiry('13/27', today)).toBe(false);
    expect(isValidExpiry('1127', today)).toBe(false);
  });

  test('CVV must be exactly 3 digits', () => {
    expect(isValidCvv('123')).toBe(true);
    expect(isValidCvv('12')).toBe(false);
    expect(isValidCvv('12a')).toBe(false);
    expect(isValidCvv('1234')).toBe(false);
  });
});

describe('checkout form', () => {
  test('an empty form has an error for every field', () => {
    expect(Object.keys(validateCheckout(emptyCheckout, today))).toEqual(
      ['fullName', 'address', 'city', 'postalCode', 'cardName', 'cardNumber', 'expiry', 'cvv']);
  });

  test('a filled form has no errors and a short postal code is caught', () => {
    expect(validateCheckout(goodForm, today)).toEqual({});
    expect(validateCheckout({ ...goodForm, postalCode: '347' }, today))
      .toEqual({ postalCode: 'Postal code must be 5 digits.' });
  });
});

describe('fake bank and orders', () => {
  test('the bank declines the two test cards and approves other cards', () => {
    expect(bankDecision('4242 4242 4242 4242')).toEqual({ approved: true, message: 'Payment approved.' });
    expect(bankDecision('4000 0000 0000 0002')).toEqual({ approved: false, message: 'Your card was declined.' });
    expect(bankDecision('4000 0000 0000 9995')).toEqual({ approved: false, message: 'Insufficient funds.' });
  });

  test('the stock check finds sold out cards and too many copies', () => {
    const inventory = [{ id: 1, stock: 0 }, { id: 2, stock: 2 }, { id: 3, stock: 5 }];
    const items = [
      { id: 1, name: 'Charmander', quantity: 1 },
      { id: 2, name: 'Squirtle', quantity: 3 },
      { id: 3, name: 'Pikachu', quantity: 5 },
      { id: 4, name: 'Deleted card', quantity: 1 },
    ];
    expect(checkStock(items, inventory)).toEqual([
      'Charmander is sold out.', 'Only 2 left of Squirtle.', 'Deleted card is sold out.',
    ]);
  });

  test('a new order gets the next id, the total and only the last 4 card digits', () => {
    expect(nextOrderId([])).toBe(1001);
    const items = [
      { id: 173, name: 'Pikachu', price: 2250, quantity: 2 },
      { id: 193, name: 'Mew ex', price: 1990, quantity: 1 },
    ];
    const order = createOrder({
      items,
      fields: goodForm,
      orders: [{ id: 1001 }, { id: 1007 }],
      user: { id: 'demo:trainer@example.com' },
      date: new Date('2026-11-20T10:00:00.000Z'),
    });
    expect(order).toEqual({
      id: 1008,
      userId: 'demo:trainer@example.com',
      date: '2026-11-20T10:00:00.000Z',
      status: 'processing',
      items,
      total: 6490,
      customer: 'Peko Trainer',
      address: '12 Sample Street, Istanbul 34710',
      cardLast4: '4242',
    });
    expect(JSON.stringify(order)).not.toContain('4242 4242');
  });
});
