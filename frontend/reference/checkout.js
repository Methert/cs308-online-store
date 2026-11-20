'use strict';

// Checkout page. store.js saves the bag in localStorage, and the bank here is fake.
// TODO: send the order to POST /api/orders when the frontend is connected to the backend.

// the fake bank declines these test cards and approves every other valid card
const declinedCards = {
  '4000000000000002': 'Your card was declined.',
  '4000000000009995': 'Insufficient funds.',
};

const fieldIds = ['full-name', 'address', 'city', 'postal-code', 'card-name', 'card-number', 'expiry', 'cvv'];

const form = document.querySelector('#checkout-form');
const emptyMessage = document.querySelector('#checkout-empty');
const summaryItems = document.querySelector('#summary-items');
const payButton = document.querySelector('#pay-button');
const bankStatus = document.querySelector('#bank-status');
const stockError = document.querySelector('#stock-error');
const resultBox = document.querySelector('#bank-result');
const cardNumberInput = document.querySelector('#card-number');
const expiryInput = document.querySelector('#expiry');
const cvvInput = document.querySelector('#cvv');

let products = loadProducts();
let bagItems = [];

// only digits, at most 16, with a space after every 4 digits
function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// "1127" -> "11/27" while typing
function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length < 3) return digits;
  return digits.slice(0, 2) + '/' + digits.slice(2);
}

// 16 digits and the Luhn check (the check digit rule that real card numbers follow)
function isValidCardNumber(value) {
  const digits = value.replace(/\s/g, '');
  if (!/^\d{16}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    // start from the last digit and double every second one
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit = digit * 2;
      if (digit > 9) digit = digit - 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// MM/YY, the card can be used until the end of that month
function isValidExpiry(value, today = new Date()) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1;
  return year > thisYear || (year === thisYear && month >= thisMonth);
}

function isValidCvv(value) {
  return /^\d{3}$/.test(value.trim());
}

// returns { fieldId: message } for every wrong field, an empty object means the form is ok
function validateCheckout(values, today = new Date()) {
  const errors = {};
  if (!values['full-name'].trim()) errors['full-name'] = 'Enter your full name.';
  if (!values.address.trim()) errors.address = 'Enter your address.';
  if (!values.city.trim()) errors.city = 'Enter your city.';
  if (!/^\d{5}$/.test(values['postal-code'].trim())) errors['postal-code'] = 'Postal code must be 5 digits.';
  if (!values['card-name'].trim()) errors['card-name'] = 'Enter the name on the card.';
  if (!isValidCardNumber(values['card-number'])) errors['card-number'] = 'Enter a valid 16-digit card number.';
  if (!isValidExpiry(values.expiry, today)) errors.expiry = 'Enter a date in MM/YY that has not passed.';
  if (!isValidCvv(values.cvv)) errors.cvv = 'CVV must be 3 digits.';
  return errors;
}

// the fake bank
function bankDecision(cardNumber) {
  const digits = cardNumber.replace(/\s/g, '');
  if (declinedCards[digits]) return { approved: false, message: declinedCards[digits] };
  return { approved: true, message: 'Payment approved.' };
}

// turns the saved [id, quantity] pairs into { product, quantity } rows
function getBagItems(savedBag, productList) {
  const items = [];
  for (const [id, quantity] of savedBag) {
    const product = productList.find(p => p.id === id);
    if (product && quantity > 0) items.push({ product, quantity });
  }
  return items;
}

function bagTotal(items) {
  let total = 0;
  for (const item of items) total += item.product.price * item.quantity;
  return total;
}

// a message for every card that does not have enough stock anymore
function checkStock(items) {
  const problems = [];
  for (const item of items) {
    if (item.product.stock === 0) problems.push(`${item.product.name} is sold out.`);
    else if (item.quantity > item.product.stock) problems.push(`Only ${item.product.stock} left of ${item.product.name}.`);
  }
  return problems;
}

function nextOrderId(orders) {
  let biggest = 1000;
  for (const order of orders) {
    if (order.id > biggest) biggest = order.id;
  }
  return biggest + 1;
}

function createOrder(items, values, orders, date = new Date()) {
  const cardDigits = values['card-number'].replace(/\s/g, '');
  return {
    id: nextOrderId(orders),
    date: date.toISOString(),
    status: 'processing',
    // name and price are copied, so the order stays the same if the product is edited later
    items: items.map(item => ({ id: item.product.id, name: item.product.name, price: item.product.price, quantity: item.quantity })),
    total: bagTotal(items),
    customer: values['full-name'].trim(),
    address: `${values.address.trim()}, ${values.city.trim()} ${values['postal-code'].trim()}`,
    // only the last 4 digits are saved, never the full number or the CVV (Req. 17)
    cardLast4: cardDigits.slice(-4),
  };
}

// saves the order, lowers the stock and empties the bag
function placeOrder(values) {
  const orders = loadOrders();
  const order = createOrder(bagItems, values, orders);
  for (const item of bagItems) item.product.stock -= item.quantity;
  orders.push(order);
  saveOrders(orders);
  saveProducts(products);
  clearBag();
  bagItems = [];
  return order;
}

function renderSummary() {
  summaryItems.innerHTML = bagItems.map(item => `<li>
      <img src="assets/card-preview.svg" alt="" width="40" height="56" style="background-color: ${item.product.tone}">
      <span>${escapeHtml(item.product.name)}<small>${item.quantity} × ${money(item.product.price)}</small></span>
      <strong>${money(item.product.price * item.quantity)}</strong>
    </li>`).join('');
  const total = money(bagTotal(bagItems));
  document.querySelector('#summary-subtotal').textContent = total;
  document.querySelector('#summary-total').textContent = total;
  payButton.textContent = `Pay ${total}`;
}

function renderPage() {
  const empty = bagItems.length === 0;
  emptyMessage.hidden = !empty;
  form.hidden = empty;
  if (!empty) renderSummary();
}

function readForm() {
  const values = {};
  for (const id of fieldIds) values[id] = document.querySelector('#' + id).value;
  return values;
}

function showErrors(errors) {
  for (const id of fieldIds) {
    const message = errors[id] || '';
    document.querySelector(`#${id}-error`).textContent = message;
    document.querySelector('#' + id).setAttribute('aria-invalid', message ? 'true' : 'false');
  }
}

function showApproved(order) {
  form.hidden = true;
  resultBox.className = 'bank-result approved';
  resultBox.innerHTML = `
    <div class="result-icon" aria-hidden="true">✓</div>
    <h2 tabindex="-1">Payment approved</h2>
    <p>Thank you! Order #${order.id} is now processing.</p>
    <div class="panel receipt">
      <h3>Invoice</h3>
      ${order.items.map(item => `<div class="receipt-row"><span>${escapeHtml(item.name)} × ${item.quantity}</span><span>${money(item.price * item.quantity)}</span></div>`).join('')}
      <div class="receipt-row total"><span>Total paid</span><span>${money(order.total)}</span></div>
      <p>Deliver to ${escapeHtml(order.customer)}, ${escapeHtml(order.address)}</p>
      <p>Paid on ${formatDate(order.date)} with the card ending in ${order.cardLast4}</p>
    </div>
    <div class="result-actions">
      <a class="add" href="orders.html#order-${order.id}">View my orders</a>
      <a class="secondary" href="index.html">Continue shopping</a>
    </div>`;
  resultBox.hidden = false;
  resultBox.querySelector('h2').focus();
}

function showDeclined(message) {
  form.hidden = true;
  resultBox.className = 'bank-result declined';
  resultBox.innerHTML = `
    <div class="result-icon" aria-hidden="true">✕</div>
    <h2 tabindex="-1">Payment declined</h2>
    <p>${message} Nothing was charged and your bag is still saved.</p>
    <div class="result-actions">
      <button class="add" id="try-again" type="button">Try another card</button>
      <a class="secondary" href="index.html">Back to shop</a>
    </div>`;
  resultBox.hidden = false;
  resultBox.querySelector('h2').focus();
}

form.addEventListener('submit', event => {
  event.preventDefault();
  stockError.textContent = '';
  const values = readForm();
  const errors = validateCheckout(values);
  showErrors(errors);
  const firstWrong = fieldIds.find(id => errors[id]);
  if (firstWrong) {
    document.querySelector('#' + firstWrong).focus();
    return;
  }

  // the stock may have changed on the management page, so read everything again
  products = loadProducts();
  bagItems = getBagItems(loadBag(), products);
  renderPage();
  if (bagItems.length === 0) return;
  const problems = checkStock(bagItems);
  if (problems.length > 0) {
    stockError.textContent = `${problems.join(' ')} Please update your bag in the shop.`;
    return;
  }

  // TODO: require sign in before paying (Req. 4) once the account pages are merged
  payButton.disabled = true;
  bankStatus.textContent = 'Contacting your bank…';
  setTimeout(() => {
    const result = bankDecision(values['card-number']);
    payButton.disabled = false;
    bankStatus.textContent = '';
    if (result.approved) showApproved(placeOrder(values));
    else showDeclined(result.message);
  }, 1500);
});

resultBox.addEventListener('click', event => {
  if (!event.target.closest('#try-again')) return;
  resultBox.hidden = true;
  form.hidden = false;
  // new card details, the delivery address stays
  cardNumberInput.value = '';
  expiryInput.value = '';
  cvvInput.value = '';
  cardNumberInput.focus();
});

cardNumberInput.addEventListener('input', () => {
  cardNumberInput.value = formatCardNumber(cardNumberInput.value);
});
expiryInput.addEventListener('input', () => {
  expiryInput.value = formatExpiry(expiryInput.value);
});
cvvInput.addEventListener('input', () => {
  cvvInput.value = cvvInput.value.replace(/\D/g, '').slice(0, 3);
});

bagItems = getBagItems(loadBag(), products);
renderPage();
