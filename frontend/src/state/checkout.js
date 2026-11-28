// Checkout helpers: card checks, the fake bank and building an order.
// TODO: send the order to POST /api/orders when the frontend uses the backend.

// the fake bank declines these test cards and approves every other valid card
const declinedCards = {
  '4000000000000002': 'Your card was declined.',
  '4000000000009995': 'Insufficient funds.',
};

export const emptyCheckout = {
  fullName: '',
  address: '',
  city: '',
  postalCode: '',
  cardName: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
};

// only digits, at most 16, with a space after every 4 digits
export function formatCardNumber(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// "1127" -> "11/27" while typing
export function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length < 3) return digits;
  return digits.slice(0, 2) + '/' + digits.slice(2);
}

// 16 digits and the Luhn check (the check digit rule that real card numbers follow)
export function isValidCardNumber(value) {
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
export function isValidExpiry(value, today = new Date()) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1;
  return year > thisYear || (year === thisYear && month >= thisMonth);
}

export function isValidCvv(value) {
  return /^\d{3}$/.test(value.trim());
}

// returns { field: message } for every wrong field, an empty object means the form is ok
export function validateCheckout(fields, today = new Date()) {
  const errors = {};
  if (!fields.fullName.trim()) errors.fullName = 'Enter your full name.';
  if (!fields.address.trim()) errors.address = 'Enter your address.';
  if (!fields.city.trim()) errors.city = 'Enter your city.';
  if (!/^\d{5}$/.test(fields.postalCode.trim())) errors.postalCode = 'Postal code must be 5 digits.';
  if (!fields.cardName.trim()) errors.cardName = 'Enter the name on the card.';
  if (!isValidCardNumber(fields.cardNumber)) errors.cardNumber = 'Enter a valid 16-digit card number.';
  if (!isValidExpiry(fields.expiry, today)) errors.expiry = 'Enter a date in MM/YY that has not passed.';
  if (!isValidCvv(fields.cvv)) errors.cvv = 'CVV must be 3 digits.';
  return errors;
}

// the fake bank
export function bankDecision(cardNumber) {
  const digits = cardNumber.replace(/\s/g, '');
  if (declinedCards[digits]) return { approved: false, message: declinedCards[digits] };
  return { approved: true, message: 'Payment approved.' };
}

// a message for every bag item that does not have enough stock in the inventory
export function checkStock(items, inventory) {
  const problems = [];
  for (const item of items) {
    const product = inventory.find(product => product.id === item.id);
    const stock = product ? product.stock : 0;
    if (stock === 0) problems.push(`${item.name} is sold out.`);
    else if (item.quantity > stock) problems.push(`Only ${stock} left of ${item.name}.`);
  }
  return problems;
}

export function nextOrderId(orders) {
  let biggest = 1000;
  for (const order of orders) {
    if (order.id > biggest) biggest = order.id;
  }
  return biggest + 1;
}

export function createOrder({ items, fields, orders, user, date = new Date() }) {
  let total = 0;
  for (const item of items) total += item.price * item.quantity;
  return {
    id: nextOrderId(orders),
    userId: user.id,
    date: date.toISOString(),
    status: 'processing',
    // name and price are copied, so the order stays the same if the product changes later
    items: items.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
    total,
    customer: fields.fullName.trim(),
    address: `${fields.address.trim()}, ${fields.city.trim()} ${fields.postalCode.trim()}`,
    // only the last 4 digits are saved, never the full number or the CVV (Req. 17)
    cardLast4: fields.cardNumber.replace(/\s/g, '').slice(-4),
  };
}
