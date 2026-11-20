const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dataSource = fs.readFileSync(path.join(__dirname, 'shop-data.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'checkout.js'), 'utf8');

// a fake page: every element is a plain object and localStorage keeps strings in a Map
function loadCheckout(saved = {}) {
  const storage = new Map(Object.entries(saved));
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, { value: '', addEventListener() {}, setAttribute() {}, focus() {} });
      }
      return elements.get(selector);
    },
  };
  const localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const page = vm.createContext({ document, localStorage });
  vm.runInContext(dataSource, page);
  vm.runInContext(source, page);
  const run = code => vm.runInContext(code, page);
  // objects made inside the vm have other prototypes, so compare them as JSON
  const json = code => JSON.parse(run(`JSON.stringify(${code})`));
  return { run, json, elements, storage };
}

const goodForm = `({
  'full-name': 'Ash Ketchum',
  address: '1 Pallet Road',
  city: 'Istanbul',
  'postal-code': '34000',
  'card-name': 'ASH KETCHUM',
  'card-number': '4242 4242 4242 4242',
  expiry: '12/30',
  cvv: '123',
})`;

test('card number and expiry are formatted while typing', () => {
  const { run } = loadCheckout();
  assert.equal(run("formatCardNumber('4242-4242 4242a42429999')"), '4242 4242 4242 4242');
  assert.equal(run("formatCardNumber('42424')"), '4242 4');
  assert.equal(run("formatExpiry('1130')"), '11/30');
  assert.equal(run("formatExpiry('1')"), '1');
});

test('Luhn check accepts the test cards and rejects a wrong digit', () => {
  const { run } = loadCheckout();
  assert.equal(run("isValidCardNumber('4242 4242 4242 4242')"), true);
  assert.equal(run("isValidCardNumber('4000 0000 0000 0002')"), true);
  assert.equal(run("isValidCardNumber('4242 4242 4242 4241')"), false);
  assert.equal(run("isValidCardNumber('4242 4242 4242')"), false);
});

test('expiry must be MM/YY and not in the past', () => {
  const { run } = loadCheckout();
  const today = 'new Date(2026, 10, 20)'; // 20 November 2026
  assert.equal(run(`isValidExpiry('11/26', ${today})`), true);
  assert.equal(run(`isValidExpiry('10/26', ${today})`), false);
  assert.equal(run(`isValidExpiry('01/27', ${today})`), true);
  assert.equal(run(`isValidExpiry('13/27', ${today})`), false);
  assert.equal(run(`isValidExpiry('1127', ${today})`), false);
});

test('CVV must be exactly 3 digits', () => {
  const { run } = loadCheckout();
  assert.equal(run("isValidCvv('123')"), true);
  assert.equal(run("isValidCvv('12')"), false);
  assert.equal(run("isValidCvv('1234')"), false);
  assert.equal(run("isValidCvv('12a')"), false);
});

test('the form lists every empty field and accepts a correct one', () => {
  const { json } = loadCheckout();
  const errors = json(`validateCheckout({ 'full-name': '', address: '', city: '', 'postal-code': '', 'card-name': '', 'card-number': '', expiry: '', cvv: '' })`);
  assert.deepEqual(Object.keys(errors), ['full-name', 'address', 'city', 'postal-code', 'card-name', 'card-number', 'expiry', 'cvv']);
  assert.deepEqual(json(`validateCheckout(${goodForm}, new Date(2026, 10, 20))`), {});
});

test('the mock bank declines the decline test cards and approves the others', () => {
  const { json } = loadCheckout();
  assert.deepEqual(json("bankDecision('4000 0000 0000 0002')"), { approved: false, message: 'Your card was declined.' });
  assert.deepEqual(json("bankDecision('4000 0000 0000 9995')"), { approved: false, message: 'Insufficient funds.' });
  assert.equal(json("bankDecision('4242 4242 4242 4242')").approved, true);
});

test('an approved order lowers the stock, empties the bag and keeps only the last 4 card digits', () => {
  const { run, storage } = loadCheckout({ 'peko-bag': '[[199,2],[173,1]]' });
  run(`placeOrder(${goodForm})`);

  const orders = JSON.parse(storage.get('peko-orders'));
  const order = orders[orders.length - 1];
  assert.equal(order.id, 1004); // the sample orders are 1001 to 1003
  assert.equal(order.status, 'processing');
  assert.equal(order.total, 12900 * 2 + 2250);
  assert.equal(order.cardLast4, '4242');
  assert.doesNotMatch(storage.get('peko-orders'), /4242 4242|4242424242424242|cvv/);

  const products = JSON.parse(storage.get('peko-products'));
  assert.equal(products.find(card => card.id === 199).stock, 1);
  assert.equal(products.find(card => card.id === 173).stock, 6);
  assert.equal(storage.get('peko-bag'), '[]');
});

test('stock check warns about sold out cards and too many copies', () => {
  const { json } = loadCheckout();
  const problems = json(`checkStock([
    { product: { name: 'Blastoise ex', stock: 0 }, quantity: 1 },
    { product: { name: 'Mew ex', stock: 2 }, quantity: 3 },
    { product: { name: 'Pikachu', stock: 7 }, quantity: 1 },
  ])`);
  assert.deepEqual(problems, ['Blastoise ex is sold out.', 'Only 2 left of Mew ex.']);
});

test('the page shows the empty bag message or the order summary', () => {
  const empty = loadCheckout();
  assert.equal(empty.elements.get('#checkout-empty').hidden, false);
  assert.equal(empty.elements.get('#checkout-form').hidden, true);

  // card 999 is not in the shop anymore, so only Charizard ex is left
  const full = loadCheckout({ 'peko-bag': '[[199,1],[999,2]]' });
  assert.equal(full.elements.get('#checkout-form').hidden, false);
  assert.equal(full.elements.get('#summary-total').textContent, '$129.00');
  assert.equal(full.elements.get('#pay-button').textContent, 'Pay $129.00');
});
