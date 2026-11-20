const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'store.js'), 'utf8');

// same fake page as store.test.cjs, plus a localStorage that keeps strings in a Map
function loadStore(saved = {}) {
  const storage = new Map(Object.entries(saved));
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, { value: '', addEventListener() {} });
      }
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
  };
  const localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const store = vm.createContext({ document, localStorage });
  vm.runInContext(source, store);
  return { run: code => vm.runInContext(code, store), elements, storage };
}

test('products saved by the management page replace the sample cards', () => {
  const savedCards = [
    { id: 173, name: 'Pikachu', rarity: 'illustration', price: 2250, stock: 0, tone: '#f5e4b9', description: 'Pikachu takes a stroll.' },
    { id: 201, name: 'Mewtwo', rarity: 'ultra', price: 1550, stock: 4, tone: '#eee7fa', description: 'A new card from the manager.' },
  ];
  const { elements } = loadStore({ 'peko-products': JSON.stringify(savedCards) });
  assert.equal(elements.get('#result-count').textContent, '2 cards');
  assert.match(elements.get('#products').innerHTML, /Sold out: Pikachu" disabled/);
  assert.match(elements.get('#products').innerHTML, /Add to bag: Mewtwo"/);
});

test('the saved bag comes back without deleted cards and never above the stock', () => {
  // Blastoise ex has only 1 in stock and card 999 does not exist anymore
  const { elements, storage } = loadStore({ 'peko-bag': '[[200,3],[999,1],[173,2]]' });
  assert.equal(elements.get('#cart-count').textContent, 3);
  assert.equal(elements.get('#subtotal').textContent, '$114.90');
  assert.equal(storage.get('peko-bag'), '[[200,1],[173,2]]');
});

test('every bag change is saved for the checkout page', () => {
  const { run, storage } = loadStore();
  run('changeQuantity(catalog.get(199), 1); changeQuantity(catalog.get(199), 1);');
  assert.equal(storage.get('peko-bag'), '[[199,2]]');
  run('changeQuantity(catalog.get(199), -2);');
  assert.equal(storage.get('peko-bag'), '[]');
});
