// Helpers for the product management page (Req. 9 and 12).
// The products themselves come from the products API, see products-api.js.

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

export const emptyProduct = {
  name: '',
  categoryId: '',
  model: '',
  serial: '',
  rarity: '',
  condition: 'near_mint',
  price: '',
  stock: '',
  warranty: '',
  distributor: '',
  description: '',
};

// "12.90" -> 1290, prices are kept in cents like in data/cards.js
export function toCents(value) {
  return Math.round(Number(value) * 100);
}

export function isWholeNumber(value) {
  const text = String(value).trim();
  return text !== '' && Number.isInteger(Number(text)) && Number(text) >= 0;
}

// returns a list of messages, an empty list means the product can be saved
export function validateProduct(values, products, currentId = null) {
  const errors = [];
  if (!values.name.trim()) errors.push('Name is required.');
  if (!values.categoryId) errors.push('Choose a category.');
  if (!values.model.trim()) errors.push('Model is required.');
  if (!values.serial.trim()) errors.push('Serial number is required.');
  if (!values.rarity.trim()) errors.push('Rarity is required.');
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
    categoryId: product.categoryId ? String(product.categoryId) : '',
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

export function stockStatus(stock) {
  if (stock === 0) return 'Out of stock';
  if (stock <= LOW_STOCK) return 'Low stock';
  return 'In stock';
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
