import { toCents } from './inventory.js';

// The products API uses its own field names and dollar prices (12.9).
// The management page keeps short names and cents (1290), like the rest of the shop.
export function fromServerProduct(product) {
  return {
    id: product.id,
    categoryId: product.category?.id ?? null,
    name: product.name,
    model: product.model,
    serial: product.serialNumber,
    rarity: product.rarity,
    condition: product.condition,
    price: toCents(product.price),
    stock: product.stockQuantity,
    warranty: product.warrantyStatus,
    distributor: product.distributor,
    description: product.description,
    isActive: product.isActive,
  };
}

// body for POST /api/products and PATCH /api/products/:id
// the stock is not in it, PATCH only changes the stock through /api/products/:id/stock
export function toServerProduct(values) {
  return {
    categoryId: Number(values.categoryId),
    name: values.name.trim(),
    model: values.model.trim(),
    serialNumber: values.serial.trim(),
    rarity: values.rarity.trim(),
    condition: values.condition,
    description: values.description.trim(),
    price: Number(values.price),
    warrantyStatus: values.warranty.trim(),
    distributor: values.distributor.trim(),
  };
}
