'use strict';

// Product and stock management screens for the product manager (Req. 9 and 12).
// The product list is saved in localStorage, store.js and checkout.js read the same list.
// TODO: only product managers should open this page, check the role when sign in is merged.
// TODO: use the products API instead of localStorage when the backend has it.

// 2 or fewer cards left counts as low stock
const LOW_STOCK = 2;
const formFields = ['name', 'model', 'serial', 'rarity', 'condition', 'price', 'stock', 'warranty', 'distributor', 'description'];

const productRows = document.querySelector('#product-rows');
const productMessage = document.querySelector('#product-message');
const stockRows = document.querySelector('#stock-rows');
const stockStats = document.querySelector('#stock-stats');
const stockMessage = document.querySelector('#stock-message');
const lowOnly = document.querySelector('#low-only');
const tabButtons = [...document.querySelectorAll('[data-tab]')];
const formDialog = document.querySelector('#product-form-dialog');
const productForm = document.querySelector('#product-form');
const formTitle = document.querySelector('#form-title');
const formErrors = document.querySelector('#form-errors');

let products = loadProducts();
let editingId = null; // null while adding a new product

// "12.90" -> 1290, prices are kept in cents like in store.js
function toCents(value) {
  return Math.round(Number(value) * 100);
}

function isWholeNumber(value) {
  const text = String(value).trim();
  return text !== '' && Number.isInteger(Number(text)) && Number(text) >= 0;
}

// returns a list of messages, an empty list means the product can be saved
function validateProduct(values, productList, currentId) {
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
  const sameSerial = productList.find(product => product.id !== currentId && String(product.serial).toLowerCase() === serial);
  if (serial && sameSerial) errors.push(`Serial number ${values.serial.trim()} is already used by ${sameSerial.name}.`);
  return errors;
}

function nextProductId(productList) {
  let biggest = 0;
  for (const product of productList) {
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

function addProduct(productList, values) {
  // new cards get the light purple background from store.css
  return [...productList, productFromValues(values, nextProductId(productList), '#eee7fa')];
}

function updateProduct(productList, id, values) {
  return productList.map(product => (product.id === id ? productFromValues(values, id, product.tone) : product));
}

function deleteProduct(productList, id) {
  return productList.filter(product => product.id !== id);
}

function stockStatus(stock) {
  if (stock === 0) return 'Out of stock';
  if (stock <= LOW_STOCK) return 'Low stock';
  return 'In stock';
}

function stockClass(stock) {
  if (stock === 0) return 'out';
  if (stock <= LOW_STOCK) return 'low';
  return 'ok';
}

// returns { products, error }, the list only changes when the value is ok
function updateStock(productList, id, value) {
  if (!isWholeNumber(value)) {
    return { products: productList, error: 'Stock must be a whole number (0 or more).' };
  }
  const stock = Number(value);
  return {
    products: productList.map(product => (product.id === id ? { ...product, stock } : product)),
    error: '',
  };
}

function stockSummary(productList) {
  const summary = { products: productList.length, units: 0, low: 0, out: 0 };
  for (const product of productList) {
    summary.units += product.stock;
    if (product.stock === 0) summary.out++;
    else if (product.stock <= LOW_STOCK) summary.low++;
  }
  return summary;
}

function renderProducts() {
  if (products.length === 0) {
    productRows.innerHTML = '<tr><td colspan="9">No products yet. Use "Add product" to create one.</td></tr>';
    return;
  }
  productRows.innerHTML = products.map(product => `<tr>
      <td>${product.id}</td>
      <td><strong>${escapeHtml(product.name)}</strong></td>
      <td>${escapeHtml(product.model)}</td>
      <td>${escapeHtml(product.serial)}</td>
      <td>${rarityLabels[product.rarity]}</td>
      <td>${conditionLabels[product.condition]}</td>
      <td class="number">${money(product.price)}</td>
      <td class="number">${product.stock}</td>
      <td>
        <div class="row-actions">
          <button class="small-button" type="button" data-edit="${product.id}" aria-label="Edit ${escapeHtml(product.name)}">Edit</button>
          <button class="small-button danger" type="button" data-delete="${product.id}" aria-label="Delete ${escapeHtml(product.name)}">Delete</button>
        </div>
      </td>
    </tr>`).join('');
}

function renderStock() {
  const summary = stockSummary(products);
  stockStats.innerHTML = `
    <div class="stat"><p>Products</p><strong>${summary.products}</strong></div>
    <div class="stat"><p>Units in stock</p><strong>${summary.units}</strong></div>
    <div class="stat"><p>Low stock</p><strong>${summary.low}</strong></div>
    <div class="stat"><p>Out of stock</p><strong>${summary.out}</strong></div>`;

  const shown = lowOnly.checked ? products.filter(product => product.stock <= LOW_STOCK) : products;
  if (shown.length === 0) {
    const message = lowOnly.checked ? 'Every product has enough stock.' : 'No products yet.';
    stockRows.innerHTML = `<tr><td colspan="4">${message}</td></tr>`;
    return;
  }
  stockRows.innerHTML = shown.map(product => `<tr>
      <td><strong>${escapeHtml(product.name)}</strong></td>
      <td>${escapeHtml(product.serial)}</td>
      <td><span class="stock-label ${stockClass(product.stock)}">${stockStatus(product.stock)}</span></td>
      <td>
        <div class="row-actions">
          <input class="stock-input" type="number" min="0" step="1" value="${product.stock}" data-stock-input="${product.id}" aria-label="Stock for ${escapeHtml(product.name)}">
          <button class="small-button" type="button" data-save-stock="${product.id}">Save</button>
        </div>
      </td>
    </tr>`).join('');
}

function renderAll() {
  renderProducts();
  renderStock();
}

function showTab(tab) {
  tabButtons.forEach(button => button.setAttribute('aria-pressed', button.dataset.tab === tab));
  document.querySelector('#products-screen').hidden = tab !== 'products';
  document.querySelector('#stock-screen').hidden = tab !== 'stock';
}

// product = null opens an empty form for a new product
function openForm(product) {
  editingId = product ? product.id : null;
  formTitle.textContent = product ? `Edit ${product.name}` : 'Add product';
  formErrors.hidden = true;
  formErrors.innerHTML = '';
  for (const field of formFields) {
    const input = document.querySelector('#p-' + field);
    if (!product) input.value = '';
    else if (field === 'price') input.value = (product.price / 100).toFixed(2);
    else input.value = product[field];
  }
  if (!product) {
    document.querySelector('#p-rarity').value = 'illustration';
    document.querySelector('#p-condition').value = 'near_mint';
  }
  formDialog.showModal();
  document.querySelector('#p-name').focus();
}

productForm.addEventListener('submit', event => {
  event.preventDefault();
  const values = {};
  for (const field of formFields) values[field] = document.querySelector('#p-' + field).value;
  // read the list again in case checkout changed the stock in another tab
  products = loadProducts();
  const errors = validateProduct(values, products, editingId);
  if (errors.length > 0) {
    formErrors.innerHTML = errors.map(error => `<li>${escapeHtml(error)}</li>`).join('');
    formErrors.hidden = false;
    return;
  }
  if (editingId === null) {
    products = addProduct(products, values);
    productMessage.textContent = `${values.name.trim()} was added to the shop.`;
  } else {
    products = updateProduct(products, editingId, values);
    productMessage.textContent = `${values.name.trim()} was saved.`;
  }
  saveProducts(products);
  formDialog.close();
  renderAll();
});

document.querySelector('#add-product').addEventListener('click', () => openForm(null));
document.querySelector('#cancel-form').addEventListener('click', () => formDialog.close());

productRows.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const product = products.find(p => p.id === Number(button.dataset.edit || button.dataset.delete));
  if (!product) return;
  if (button.dataset.edit) openForm(product);
  if (button.dataset.delete && confirm(`Delete ${product.name}? It will be removed from the shop.`)) {
    products = deleteProduct(loadProducts(), product.id);
    saveProducts(products);
    productMessage.textContent = `${product.name} was deleted.`;
    renderAll();
  }
});

stockRows.addEventListener('click', event => {
  const button = event.target.closest('[data-save-stock]');
  if (!button) return;
  const id = Number(button.dataset.saveStock);
  const input = stockRows.querySelector(`[data-stock-input="${id}"]`);
  const result = updateStock(loadProducts(), id, input.value);
  if (result.error) {
    stockMessage.className = 'save-message error';
    stockMessage.textContent = result.error;
    return;
  }
  products = result.products;
  saveProducts(products);
  renderAll();
  const product = products.find(p => p.id === id);
  stockMessage.className = 'save-message';
  stockMessage.textContent = `Stock of ${product.name} is now ${product.stock}.`;
});

lowOnly.addEventListener('change', renderStock);
tabButtons.forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));

// fill the select boxes from the same labels the rest of the pages use
document.querySelector('#p-rarity').innerHTML = Object.entries(rarityLabels)
  .map(([value, label]) => `<option value="${value}">${label}</option>`)
  .join('');
document.querySelector('#p-condition').innerHTML = Object.entries(conditionLabels)
  .map(([value, label]) => `<option value="${value}">${label}</option>`)
  .join('');

renderAll();
