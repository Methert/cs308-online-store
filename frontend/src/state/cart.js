import { findCard } from './catalog.js';

export function normalizeCart(items) {
  if (!Array.isArray(items)) return [];
  const quantities = new Map();
  for (const item of items) {
    const card = findCard(item?.id);
    if (!card?.stock || !Number.isSafeInteger(item?.quantity) || item.quantity <= 0) continue;
    quantities.set(card.id, Math.min(item.quantity, card.stock));
  }
  return [...quantities].map(([id, quantity]) => ({ id, quantity }));
}

export function changeQuantity(items, id, delta) {
  const card = findCard(id);
  if (!card || !Number.isSafeInteger(delta)) return items;
  const quantity = (items.find(item => item.id === id)?.quantity ?? 0) + delta;
  if (quantity < 0 || quantity > card.stock) return items;
  const updated = items.filter(item => item.id !== id);
  if (quantity === 0) return updated;
  if (!items.some(item => item.id === id)) return [...items, { id, quantity }];
  return items.map(item => item.id === id ? { id, quantity } : item);
}

export function cartTotals(items) {
  return items.reduce((total, item) => ({
    count: total.count + item.quantity,
    cents: total.cents + (findCard(item.id)?.price ?? 0) * item.quantity,
  }), { count: 0, cents: 0 });
}

export const money = cents => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
}).format(cents / 100);
