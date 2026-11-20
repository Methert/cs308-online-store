const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dataSource = fs.readFileSync(path.join(__dirname, 'shop-data.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'orders.js'), 'utf8');

// a fake page: every element is a plain object and localStorage keeps strings in a Map
function loadOrdersPage(saved = {}, hash = '') {
  const storage = new Map(Object.entries(saved));
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, { value: '', addEventListener() {}, scrollIntoView() {} });
      }
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
  };
  const localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const page = vm.createContext({ document, localStorage, window: { location: { hash } } });
  vm.runInContext(dataSource, page);
  vm.runInContext(source, page);
  return { run: code => vm.runInContext(code, page), elements };
}

const orderNumbers = html => [...html.matchAll(/Order #(\d+)/g)].map(match => Number(match[1]));

test('sample orders are shown newest first when nothing is saved yet', () => {
  const { elements } = loadOrdersPage();
  assert.deepEqual(orderNumbers(elements.get('#order-list').innerHTML), [1003, 1002, 1001]);
  assert.equal(elements.get('#order-count').textContent, '3 orders');
});

test('the status filter shows only matching orders', () => {
  const { run, elements } = loadOrdersPage();
  run("selectStatus('delivered')");
  assert.deepEqual(orderNumbers(elements.get('#order-list').innerHTML), [1001]);
  assert.equal(elements.get('#order-count').textContent, '1 order');
  assert.equal(elements.get('#orders-empty').hidden, true);
});

test('a filter without orders shows the empty message', () => {
  const { run, elements } = loadOrdersPage();
  run("selectStatus('processing')");
  assert.equal(elements.get('#order-list').innerHTML, '');
  assert.equal(elements.get('#order-count').textContent, '0 orders');
  assert.equal(elements.get('#orders-empty').hidden, false);
});

test('progress steps follow the order status and cancelled orders have none', () => {
  const { run } = loadOrdersPage();
  assert.equal(run("stepIndex('processing')"), 0);
  assert.equal(run("stepIndex('delivered')"), 2);
  assert.equal(run("stepIndex('cancelled')"), -1);

  const inTransit = run("orderCard(orders.find(order => order.status === 'in_transit'))");
  assert.equal(inTransit.match(/class="done"/g).length, 2);
  const cancelled = run("orderCard(orders.find(order => order.status === 'cancelled'))");
  assert.match(cancelled, /This order was cancelled\./);
  assert.doesNotMatch(cancelled, /order-steps/);
});

test('a new order from checkout comes first, is highlighted and its address is escaped', () => {
  const saved = [
    { id: 1001, date: '2026-10-28T14:20:00.000Z', status: 'delivered', items: [{ id: 173, name: 'Pikachu', price: 2250, quantity: 1 }], total: 2250, customer: 'Ash', address: '1 Pallet Road', cardLast4: '4242' },
    { id: 1004, date: '2026-11-20T10:00:00.000Z', status: 'processing', items: [{ id: 199, name: 'Charizard ex', price: 12900, quantity: 2 }], total: 25800, customer: 'Ash', address: '<b>2 Pallet Road</b>', cardLast4: '9995' },
  ];
  const { elements } = loadOrdersPage({ 'peko-orders': JSON.stringify(saved) }, '#order-1004');
  const html = elements.get('#order-list').innerHTML;
  assert.deepEqual(orderNumbers(html), [1004, 1001]);
  assert.match(html, /class="order-card new-order" id="order-1004"/);
  assert.match(html, /&lt;b&gt;2 Pallet Road&lt;\/b&gt;/);
  assert.match(html, /\$258\.00/);
});
