import { StrictMode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../App.jsx';
import { ShopProvider } from './ShopContext.jsx';
import { cartTotals, normalizeCart } from './cart.js';
import { API_URL, catalogSource, findCard, getCards, loadCatalog, resetCatalog, toCard } from './catalog.js';

// Two products as GET /api/products returns them.
const charizard = {
  id: 41, name: 'Charizard ex', model: '199/165', rarity: 'Special illustration rare', condition: 'near_mint',
  price: 60, stockQuantity: 2, description: 'Charizard ex from the 151 set.', soldCount: 3,
  imageUrl: '/images/cards/sv03.5/199.webp', category: { id: 2, name: '151', setCode: 'sv03.5' },
};
const abra = {
  id: 16, name: 'Abra', model: '43/102', rarity: 'Common', condition: 'played',
  price: 1, stockQuantity: 0, description: 'Abra from the Base Set.', soldCount: 0,
  imageUrl: '/images/cards/base1/43.webp', category: { id: 1, name: 'Base Set', setCode: 'base1' },
};

// A fake fetch that serves the given pages of products.
function fakeApi(pages) {
  return vi.fn(async url => {
    const page = Number(new URL(url).searchParams.get('page'));
    return {
      ok: true,
      json: async () => ({ data: { products: pages[page - 1], pagination: { page, totalPages: pages.length } } }),
    };
  });
}

afterEach(() => act(() => resetCatalog()));

test('a product from the API becomes a card with its price in cents, set and picture', () => {
  expect(toCard(charizard)).toMatchObject({
    id: 41, name: 'Charizard ex', price: 6000, stock: 2, number: '199/165', setName: '151',
    conditionLabel: 'Near mint', rarityLabel: 'Special illustration rare',
    imageUrl: `${API_URL}/images/cards/sv03.5/199.webp`,
  });
});

test('loads every page of products and switches the source to the API', async () => {
  const fetchImpl = fakeApi([[charizard], [abra]]);
  await act(() => loadCatalog(fetchImpl));
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(catalogSource()).toBe('api');
  expect(getCards().map(card => card.name)).toEqual(['Charizard ex', 'Abra']);
});

test('keeps the sample cards when the API cannot be reached', async () => {
  await act(() => loadCatalog(async () => { throw new Error('connection refused'); }));
  expect(catalogSource()).toBe('error');
  expect(findCard(199).name).toBe('Charizard ex');
});

test('the bag drops sample cards and caps quantities once API cards arrive', async () => {
  await act(() => loadCatalog(fakeApi([[charizard, abra]])));
  const bag = normalizeCart([{ id: 199, quantity: 1 }, { id: 41, quantity: 5 }, { id: 16, quantity: 1 }]);
  expect(bag).toEqual([{ id: 41, quantity: 2 }]);
  expect(cartTotals(bag)).toEqual({ count: 2, cents: 12000 });
});

test('the shop page shows the API cards with their pictures and rarity filters', async () => {
  await act(() => loadCatalog(fakeApi([[charizard, abra]])));
  const user = userEvent.setup();
  render(<StrictMode><MemoryRouter><ShopProvider><App /></ShopProvider></MemoryRouter></StrictMode>);

  const card = screen.getByRole('heading', { name: 'Charizard ex' }).closest('article');
  expect(within(card).getByText('151 · #199/165 · Near mint')).toBeTruthy();
  expect(card.querySelector('img').getAttribute('src')).toBe(`${API_URL}/images/cards/sv03.5/199.webp`);
  expect(screen.getByRole('button', { name: 'Sold out: Abra' }).disabled).toBe(true);

  await user.click(screen.getByRole('button', { name: 'Common' }));
  expect(screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual(['Abra']);
});

test('the shop page says when it falls back to sample cards', async () => {
  await act(() => loadCatalog(async () => { throw new Error('offline'); }));
  render(<MemoryRouter><ShopProvider><App /></ShopProvider></MemoryRouter>);
  expect(screen.getByText('The shop server is not reachable, so sample cards are shown.')).toBeTruthy();
});
