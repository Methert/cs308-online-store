const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'store.js'), 'utf8');

function loadStore() {
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
  const store = vm.createContext({ document });
  vm.runInContext(source, store);
  return { run: code => vm.runInContext(code, store), elements };
}

test('description search retains a sold-out card and disables its add button', () => {
  const { run, elements } = loadStore();
  elements.get('#search').value = '  ROCKY LANDSCAPE  ';
  run('renderCatalog()');
  assert.equal(elements.get('#result-count').textContent, '1 card');
  assert.match(elements.get('#products').innerHTML, /Sold out: Charmander" disabled/);
});

test('price sorting orders cards within the selected rarity', () => {
  const { run, elements } = loadStore();
  elements.get('#sort').value = 'low';
  run("selectRarity('special')");
  const names = [...elements.get('#products').innerHTML.matchAll(/class="card-title">([^<]+)/g)];
  assert.deepEqual(names.map(match => match[1]), ['Venusaur ex', 'Blastoise ex', 'Charizard ex']);
});

test('the bag caps stock, updates its subtotal, and empties after removal', () => {
  const { run, elements } = loadStore();
  run('changeQuantity(catalog.get(200), 1); changeQuantity(catalog.get(200), 1);');
  assert.equal(elements.get('#cart-count').textContent, 1);
  assert.equal(elements.get('#subtotal').textContent, '$69.90');
  assert.equal(elements.get('#cart-summary').hidden, false);

  run('changeQuantity(catalog.get(200), -1);');
  assert.equal(elements.get('#cart-count').textContent, 0);
  assert.equal(elements.get('#cart-summary').hidden, true);
  assert.match(elements.get('#cart-items').innerHTML, /Your bag is empty/);
});
