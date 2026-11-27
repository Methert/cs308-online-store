import { useSyncExternalStore } from 'react';
import { rarityLabels } from '../data/cards.js';
import { API_URL, request } from './api.js';
export { API_URL } from './api.js';

// Public catalog shared by the shop and product labels. Network failures stay visible;
// failed requests never substitute browser demo products for server records.

const CONDITION_LABELS = {
  mint: 'Mint', near_mint: 'Near mint', excellent: 'Excellent', good: 'Good', played: 'Played', poor: 'Poor',
};
// Backgrounds behind a card picture while it loads, by card set.
const SET_TONES = { base1: '#f3e2c4', 'sv03.5': '#dce8ce', 'swsh12.5': '#e2ddf0' };

let state = { cards: [], source: 'idle' };
let byId = new Map();
let pending;
const listeners = new Set();

function publish(next) {
  state = next;
  byId = new Map(next.cards.map(card => [card.id, card]));
  for (const listener of listeners) listener();
}

export function getCards() {
  return state.cards;
}

export function findCard(id) {
  return byId.get(id);
}

// idle, loading, api (confirmed server data), or error.
export function catalogSource() {
  return state.source;
}

export function subscribeCatalog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCatalog() {
  return useSyncExternalStore(subscribeCatalog, () => state);
}

// The label shown for a card's rarity, for sample and API cards alike.
export function rarityLabel(card) {
  return card.rarityLabel ?? rarityLabels[card.rarity] ?? card.rarity;
}

// Turns a product from the API into the card shape the shop components use.
// Prices are kept in cents, like the sample cards.
export function toCard(product) {
  return {
    id: product.id,
    name: product.name,
    rarity: product.rarity,
    rarityLabel: rarityLabels[product.rarity] ?? product.rarity,
    condition: product.condition,
    conditionLabel: CONDITION_LABELS[product.condition] ?? product.condition,
    price: Math.round(Number(product.price) * 100),
    stock: product.stockQuantity,
    description: product.description,
    number: product.model,
    setName: product.category?.name,
    setCode: product.category?.setCode,
    soldCount: product.soldCount ?? 0,
    serial: product.serialNumber,
    warranty: product.warrantyStatus,
    distributor: product.distributor,
    imageUrl: product.imageUrl ? `${API_URL}${product.imageUrl}` : null,
    tone: SET_TONES[product.category?.setCode] ?? '#eadbef',
  };
}

// A failed refresh retains previous cards for browsing. Purchase actions stay disabled
// until a successful retry confirms current server data.
async function fetchCatalog(fetchImpl) {
  publish({ ...state, source: 'loading', error: '' });
  try {
    const products = [];
    for (let page = 1, totalPages = 1; page <= totalPages; page++) {
      const data = await request(`/products?limit=100&page=${page}&sort=name_asc`, { fetchImpl });
      products.push(...data.products);
      totalPages = data.pagination?.totalPages ?? 1;
    }
    publish({ cards: products.map(toCard), source: 'api' });
  } catch (err) {
    publish({ cards: state.cards, source: 'error', error: err.message });
  }
  return state;
}

export function loadCatalog(fetchImpl = globalThis.fetch) {
  if (!pending) pending = fetchCatalog(fetchImpl).finally(() => { pending = null; });
  return pending;
}

// Reset between tests without loading demo records in the running application.
export function resetCatalog(cards = []) {
  publish({ cards, source: cards.length ? 'api' : 'idle' });
}
