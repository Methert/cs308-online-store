import { useSyncExternalStore } from 'react';
import { cards as sampleCards, rarityLabels } from '../data/cards.js';

// The cards the shop sells. It starts with the sample cards in data/cards.js and switches to the
// backend's products once GET /api/products answers. The bag, the catalog and checkout all read
// cards from here, so they always agree on prices and stock.

// Address of the backend; set VITE_API_URL in frontend/.env to use another one.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const CONDITION_LABELS = {
  mint: 'Mint', near_mint: 'Near mint', excellent: 'Excellent', good: 'Good', played: 'Played', poor: 'Poor',
};
// Backgrounds behind a card picture while it loads, by card set.
const SET_TONES = { base1: '#f3e2c4', 'sv03.5': '#dce8ce', 'swsh12.5': '#e2ddf0' };

let state = { cards: sampleCards, source: 'sample' };
let byId = new Map(sampleCards.map(card => [card.id, card]));
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

// Where the cards came from: "sample" (data/cards.js), "api" or "error" (API unreachable).
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
    rarityLabel: product.rarity,
    condition: product.condition,
    conditionLabel: CONDITION_LABELS[product.condition] ?? product.condition,
    price: Math.round(Number(product.price) * 100),
    stock: product.stockQuantity,
    description: product.description,
    number: product.model,
    setName: product.category?.name,
    setCode: product.category?.setCode,
    soldCount: product.soldCount ?? 0,
    imageUrl: product.imageUrl ? `${API_URL}${product.imageUrl}` : null,
    tone: SET_TONES[product.category?.setCode] ?? '#eadbef',
  };
}

// Loads every product page from the API. On failure the sample cards stay and the source
// becomes "error", so the shop still works offline.
export async function loadCatalog(fetchImpl = globalThis.fetch) {
  try {
    const products = [];
    for (let page = 1, totalPages = 1; page <= totalPages; page++) {
      const res = await fetchImpl(`${API_URL}/api/products?limit=100&page=${page}&sort=name_asc`);
      if (!res.ok) throw new Error(`GET /api/products answered ${res.status}`);
      const { data } = await res.json();
      products.push(...data.products);
      totalPages = data.pagination?.totalPages ?? 1;
    }
    publish({ cards: products.map(toCard), source: 'api' });
  } catch (err) {
    publish({ cards: state.source === 'api' ? state.cards : sampleCards, source: 'error', error: err.message });
  }
  return state;
}

// For tests: go back to the sample cards.
export function resetCatalog() {
  publish({ cards: sampleCards, source: 'sample' });
}
