import { describe, expect, test } from 'vitest';
import { emptyProduct, isWholeNumber, productToValues, stockStatus, stockSummary, toCents, validateProduct } from './inventory.js';

const mewtwo = {
  name: 'Mewtwo',
  categoryId: '1',
  model: '150/165',
  serial: 'PC-151-150',
  rarity: 'Ultra rare',
  condition: 'mint',
  price: '15.00',
  stock: '3',
  warranty: '30-day authenticity guarantee',
  distributor: 'The Pokémon Company International',
  description: 'Mewtwo floats in a purple glow.',
};

// products like the management page keeps them (see products-api.js)
const products = [
  { id: 173, categoryId: 1, name: 'Pikachu', model: '173/165', serial: 'PC-151-173', rarity: 'Illustration rare', condition: 'near_mint',
    price: 2250, stock: 7, warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International', description: 'Pikachu in a city.', isActive: true },
  { id: 170, categoryId: 1, name: 'Squirtle', model: '170/165', serial: 'PC-151-170', rarity: 'Illustration rare', condition: 'good',
    price: 3490, stock: 2, warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International', description: 'Squirtle by the sea.', isActive: true },
  { id: 200, categoryId: 1, name: 'Blastoise ex', model: '200/165', serial: 'PC-151-200', rarity: 'Special illustration rare', condition: 'mint',
    price: 4590, stock: 0, warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International', description: 'Blastoise ex.', isActive: true },
];

describe('products', () => {
  test('an empty product form lists every missing field', () => {
    expect(validateProduct(emptyProduct, products)).toEqual([
      'Name is required.', 'Choose a category.', 'Model is required.', 'Serial number is required.', 'Rarity is required.',
      'Description is required.', 'Warranty status is required.', 'Distributor is required.', 'Price must be more than $0.',
      'Stock must be a whole number (0 or more).',
    ]);
    expect(validateProduct(mewtwo, products)).toEqual([]);
  });

  test('price and stock must be sensible numbers', () => {
    expect(validateProduct({ ...mewtwo, price: '0' }, products)).toEqual(['Price must be more than $0.']);
    for (const stock of ['-1', '2.5', 'ten', ' ']) {
      expect(validateProduct({ ...mewtwo, stock }, products)).toEqual(['Stock must be a whole number (0 or more).']);
    }
    expect(isWholeNumber('0')).toBe(true);
    expect(toCents('12.9')).toBe(1290);
    expect(toCents(0.29)).toBe(29);
  });

  test('a serial number can not be used twice, but a product can keep its own', () => {
    expect(validateProduct({ ...mewtwo, serial: 'pc-151-173' }, products))
      .toEqual(['Serial number pc-151-173 is already used by Pikachu.']);
    expect(validateProduct(productToValues(products[0]), products, 173)).toEqual([]);
  });

  test('a product is turned back into text for the form', () => {
    expect(productToValues(products[0])).toMatchObject({ categoryId: '1', price: '22.50', stock: '7', serial: 'PC-151-173' });
    expect(productToValues({ ...products[0], categoryId: null }).categoryId).toBe('');
  });
});

describe('stock', () => {
  test('stock status and the summary of a product list', () => {
    expect([0, 1, 2, 3].map(stock => stockStatus(stock))).toEqual(['Out of stock', 'Low stock', 'Low stock', 'In stock']);
    expect(stockSummary(products)).toEqual({ products: 3, units: 9, low: 1, out: 1 });
  });
});
