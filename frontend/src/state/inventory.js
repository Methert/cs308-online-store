import { cards } from '../data/cards.js';

// Product list for the management screens (Req. 9 and 12), saved in localStorage.
// The shop page still shows data/cards.js.
// TODO: read and save products through the products API when the backend has it.

export const INVENTORY_KEY = 'peko-cards-inventory-v1';

// 2 or fewer cards left counts as low stock
export const LOW_STOCK = 2;

// same values as the card_condition enum in the database
export const conditionLabels = {
  mint: 'Mint',
  near_mint: 'Near mint',
  excellent: 'Excellent',
  good: 'Good',
  played: 'Played',
  poor: 'Poor',
};

// the sample cards plus the product fields the shop page does not show yet
export const defaultInventory = cards.map(card => ({
  ...card,
  model: `${card.id}/165`,
  serial: `PC-151-${card.id}`,
  condition: 'near_mint',
  warranty: '30-day authenticity guarantee',
  distributor: 'The Pokémon Company International',
}));

export const emptyProduct = {
  name: '',
  model: '',
  serial: '',
  rarity: 'illustration',
  condition: 'near_mint',
  price: '',
  stock: '',
  warranty: '',
  distributor: '',
  description: '',
};

export function readInventory() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(INVENTORY_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    // broken or blocked storage, use the sample list
  }
  return defaultInventory;
}

export function saveInventory(products) {
  try {
    window.localStorage.setItem(INVENTORY_KEY, JSON.stringify(products));
    return true;
  } catch {
    return false;
  }
}

// "12.90" -> 1290, prices are kept in cents like in data/cards.js
export function toCents(value) {
  return Math.round(Number(value) * 100);
}

function isWholeNumber(value) {
  const text = String(value).trim();
  return text !== '' && Number.isInteger(Number(text)) && Number(text) >= 0;
}

// returns a list of messages, an empty list means the product can be saved
export function validateProduct(values, products, currentId = null) {
  const errors = [];
  if (!values.name.trim()) errors.push('Name is required.');
  if (!values.model.trim()) errors.push('Model is required.');
  if (!values.serial.trim()) errors.push('Serial number is required.');
  if (!values.description.trim()) errors.push('Description is required.');
  if (!values.warranty.trim()) errors.push('Warranty status is required.');
  if (!values.distributor.trim()) errors.push('Distributor is required.');
  if (!(Number(values.price) > 0)) errors.push('Price must be more than $0.');
  if (!isWholeNumber(values.stock)) errors.push('Stock must be a whole number (0 or more).');

  // two products can not have the same serial number
  const serial = values.serial.trim().toLowerCase();
  const sameSerial = products.find(product => product.id !== currentId && String(product.serial).toLowerCase() === serial);
  if (serial && sameSerial) errors.push(`Serial number ${values.serial.trim()} is already used by ${sameSerial.name}.`);
  return errors;
}

// the form keeps everything as text, so turn a product back into form values
export function productToValues(product) {
  return {
    name: product.name,
    model: product.model,
    serial: product.serial,
    rarity: product.rarity,
    condition: product.condition,
    price: (product.price / 100).toFixed(2),
    stock: String(product.stock),
    warranty: product.warranty,
    distributor: product.distributor,
    description: product.description,
  };
}

function nextProductId(products) {
  let biggest = 0;
  for (const product of products) {
    if (product.id > biggest) biggest = product.id;
  }
  return biggest + 1;
}

function productFromValues(values, id, tone) {
  return {
    id,
    name: values.name.trim(),
    rarity: values.rarity,
    price: toCents(values.price),
    stock: Number(values.stock),
    tone,
    description: values.description.trim(),
    model: values.model.trim(),
    serial: values.serial.trim(),
    condition: values.condition,
    warranty: values.warranty.trim(),
    distributor: values.distributor.trim(),
  };
}

export function addProduct(products, values) {
  // new cards get the light purple background of the shop
  return [...products, productFromValues(values, nextProductId(products), '#eee7fa')];
}

export function updateProduct(products, id, values) {
  return products.map(product => (product.id === id ? productFromValues(values, id, product.tone) : product));
}

export function deleteProduct(products, id) {
  return products.filter(product => product.id !== id);
}

export function stockStatus(stock) {
  if (stock === 0) return 'Out of stock';
  if (stock <= LOW_STOCK) return 'Low stock';
  return 'In stock';
}

// returns { products, error }, the list only changes when the value is ok
export function updateStock(products, id, value) {
  if (!isWholeNumber(value)) {
    return { products, error: 'Stock must be a whole number (0 or more).' };
  }
  const stock = Number(value);
  return {
    products: products.map(product => (product.id === id ? { ...product, stock } : product)),
    error: '',
  };
}

export function stockSummary(products) {
  const summary = { products: products.length, units: 0, low: 0, out: 0 };
  for (const product of products) {
    summary.units += product.stock;
    if (product.stock === 0) summary.out++;
    else if (product.stock <= LOW_STOCK) summary.low++;
  }
  return summary;
}

// after an approved payment, every product in the order loses that many copies
export function lowerStock(products, items) {
  return products.map(product => {
    const item = items.find(item => item.id === product.id);
    if (!item) return product;
    return { ...product, stock: Math.max(0, product.stock - item.quantity) };
  });
}
