import { describe, expect, test } from 'vitest';
import { cards } from '../data/cards.js';
import {
  addProduct, defaultInventory, deleteProduct, emptyProduct, INVENTORY_KEY, lowerStock, productToValues,
  readInventory, saveInventory, stockStatus, stockSummary, toCents, updateProduct, updateStock, validateProduct,
} from './inventory.js';

const mewtwo = {
  name: 'Mewtwo',
  model: '150/165',
  serial: 'PC-151-150',
  rarity: 'ultra',
  condition: 'mint',
  price: '15.00',
  stock: '3',
  warranty: '30-day authenticity guarantee',
  distributor: 'The Pokémon Company International',
  description: 'Mewtwo floats in a purple glow.',
};

describe('products', () => {
  test('the sample inventory has every shop card and the extra product fields', () => {
    expect(defaultInventory.map(product => product.id)).toEqual(cards.map(card => card.id));
    expect(defaultInventory[1]).toMatchObject({
      name: 'Pikachu', price: 2250, stock: 7, model: '173/165', serial: 'PC-151-173', condition: 'near_mint',
    });
  });

  test('saved products are read back and broken storage gives the sample list', () => {
    expect(readInventory()).toBe(defaultInventory);
    const smaller = deleteProduct(defaultInventory, 173);
    expect(saveInventory(smaller)).toBe(true);
    expect(readInventory()).toEqual(smaller);
    localStorage.setItem(INVENTORY_KEY, '{broken');
    expect(readInventory()).toBe(defaultInventory);
  });

  test('an empty product form lists every missing field', () => {
    expect(validateProduct(emptyProduct, defaultInventory)).toEqual([
      'Name is required.', 'Model is required.', 'Serial number is required.', 'Description is required.',
      'Warranty status is required.', 'Distributor is required.', 'Price must be more than $0.',
      'Stock must be a whole number (0 or more).',
    ]);
    expect(validateProduct(mewtwo, defaultInventory)).toEqual([]);
  });

  test('price and stock must be sensible numbers', () => {
    expect(validateProduct({ ...mewtwo, price: '0' }, defaultInventory)).toEqual(['Price must be more than $0.']);
    for (const stock of ['-1', '2.5', 'ten', ' ']) {
      expect(validateProduct({ ...mewtwo, stock }, defaultInventory)).toEqual(['Stock must be a whole number (0 or more).']);
    }
    expect(toCents('12.9')).toBe(1290);
    expect(toCents('0.29')).toBe(29);
  });

  test('a serial number can not be used twice, but a product can keep its own', () => {
    expect(validateProduct({ ...mewtwo, serial: 'pc-151-173' }, defaultInventory))
      .toEqual(['Serial number pc-151-173 is already used by Pikachu.']);
    expect(validateProduct(productToValues(defaultInventory[1]), defaultInventory, 173)).toEqual([]);
  });

  test('add, edit and delete change only the right product', () => {
    const added = addProduct(defaultInventory, mewtwo);
    expect(added).toHaveLength(9);
    expect(added[8]).toMatchObject({ id: 201, name: 'Mewtwo', price: 1500, stock: 3, tone: '#eee7fa' });
    const edited = updateProduct(added, 173, { ...productToValues(added[1]), price: '24' });
    expect(edited[1]).toMatchObject({ id: 173, name: 'Pikachu', price: 2400, tone: '#f5e4b9' });
    expect(edited[0]).toBe(added[0]);
    expect(deleteProduct(edited, 201).map(product => product.id)).toEqual(cards.map(card => card.id));
  });
});

describe('stock', () => {
  test('stock status and the summary of the sample list', () => {
    expect([0, 1, 2, 3].map(stock => stockStatus(stock))).toEqual(['Out of stock', 'Low stock', 'Low stock', 'In stock']);
    expect(stockSummary(defaultInventory)).toEqual({ products: 8, units: 28, low: 2, out: 1 });
  });

  test('a stock update only accepts whole numbers', () => {
    const result = updateStock(defaultInventory, 200, '4');
    expect(result.error).toBe('');
    expect(result.products.find(product => product.id === 200).stock).toBe(4);
    expect(updateStock(defaultInventory, 200, '-2'))
      .toEqual({ products: defaultInventory, error: 'Stock must be a whole number (0 or more).' });
  });

  test('a paid order lowers the stock but never below zero', () => {
    const lowered = lowerStock(defaultInventory, [{ id: 173, quantity: 2 }, { id: 200, quantity: 5 }]);
    expect(lowered.find(product => product.id === 173).stock).toBe(5);
    expect(lowered.find(product => product.id === 200).stock).toBe(0);
    expect(lowered.find(product => product.id === 199)).toBe(defaultInventory[0]);
  });
});
