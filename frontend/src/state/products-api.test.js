import { expect, test } from 'vitest';
import { productToValues } from './inventory.js';
import { fromServerProduct, toServerProduct } from './products-api.js';

// one product the way GET /api/products/manage sends it
const serverProduct = {
  id: 12,
  name: 'Pikachu',
  model: '173/165',
  serialNumber: 'SV03.5-173-NM',
  description: 'Pikachu takes a stroll through a lively city street.',
  rarity: 'Illustration rare',
  condition: 'near_mint',
  price: 22.5,
  stockQuantity: 7,
  inStock: true,
  warrantyStatus: '30-day authenticity guarantee',
  distributor: 'The Pokémon Company International',
  imageUrl: '/images/cards/sv03.5-173.png',
  category: { id: 3, name: '151', setCode: 'sv03.5', series: 'Scarlet & Violet' },
  cost: null,
  isActive: true,
};

test('a server product gets the short names and a price in cents', () => {
  expect(fromServerProduct(serverProduct)).toEqual({
    id: 12, categoryId: 3, name: 'Pikachu', model: '173/165', serial: 'SV03.5-173-NM', rarity: 'Illustration rare',
    condition: 'near_mint', price: 2250, stock: 7, warranty: '30-day authenticity guarantee',
    distributor: 'The Pokémon Company International', description: 'Pikachu takes a stroll through a lively city street.', isActive: true,
  });
  expect(fromServerProduct({ ...serverProduct, price: 0.29, category: null })).toMatchObject({ price: 29, categoryId: null });
});

test('form values become the body the products API expects, without the stock', () => {
  const values = { ...productToValues(fromServerProduct(serverProduct)), name: '  Pikachu  ', price: '24' };
  expect(toServerProduct(values)).toEqual({
    categoryId: 3, name: 'Pikachu', model: '173/165', serialNumber: 'SV03.5-173-NM', rarity: 'Illustration rare',
    condition: 'near_mint', description: 'Pikachu takes a stroll through a lively city street.', price: 24,
    warrantyStatus: '30-day authenticity guarantee', distributor: 'The Pokémon Company International',
  });
});
