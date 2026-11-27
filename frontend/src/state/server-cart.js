import { toCard } from './catalog.js';

// Keep server quantities intact, including stock conflicts created by a login merge.
export function fromServerCart(data) {
  if (!Array.isArray(data?.items) || data.items.some(item => !Number.isSafeInteger(item.productId)
    || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !item.product
    || !Number.isFinite(Number(item.product.price)) || !Number.isSafeInteger(item.product.stockQuantity))) {
    throw new Error('The shop returned an incomplete bag. Please reload it.');
  }
  return data.items.map(item => ({ id: item.productId, quantity: item.quantity, card: toCard(item.product) }));
}
