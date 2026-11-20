const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dataSource = fs.readFileSync(path.join(__dirname, 'shop-data.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'manage.js'), 'utf8');

// a fake page: every element is a plain object and localStorage keeps strings in a Map
function loadManage(saved = {}) {
  const storage = new Map(Object.entries(saved));
  const elements = new Map();
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) {
        elements.set(selector, { value: '', checked: false, addEventListener() {}, setAttribute() {} });
      }
      return elements.get(selector);
    },
    querySelectorAll() { return []; },
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
  return { run, json, elements };
}

const newCard = `({
  name: 'Mewtwo',
  model: '150/165',
  serial: 'PC-151-150',
  rarity: 'ultra',
  condition: 'excellent',
  price: '15.50',
  stock: '4',
  warranty: '30-day authenticity guarantee',
  distributor: 'The Pokémon Company International',
  description: 'Mewtwo floats above a broken lab.',
})`;

test('prices typed in dollars are kept in cents', () => {
  const { run } = loadManage();
  assert.equal(run("toCents('12.90')"), 1290);
  assert.equal(run("toCents('0.1')"), 10);
  assert.equal(run("toCents('19.999')"), 2000);
});

test('the product form reports empty fields and wrong numbers', () => {
  const { json } = loadManage();
  const errors = json(`validateProduct({
    name: ' ', model: '', serial: '', rarity: 'ultra', condition: 'mint',
    price: '-1', stock: '1.5', warranty: '', distributor: '', description: '',
  }, products, null)`);
  assert.equal(errors.length, 8);
  assert.ok(errors.includes('Name is required.'));
  assert.ok(errors.includes('Price must be more than $0.'));
  assert.ok(errors.includes('Stock must be a whole number (0 or more).'));
  assert.deepEqual(json(`validateProduct(${newCard}, products, null)`), []);
});

test('a serial number can be used only once, except by the product being edited', () => {
  const { json } = loadManage();
  const sameSerial = `({ ...${newCard}, serial: 'pc-151-199' })`;
  assert.deepEqual(json(`validateProduct(${sameSerial}, products, null)`), ['Serial number pc-151-199 is already used by Charizard ex.']);
  assert.deepEqual(json(`validateProduct(${sameSerial}, products, 199)`), []);
});

test('a new product gets the next id and its price is saved in cents', () => {
  const { json } = loadManage();
  const list = json(`addProduct(products, ${newCard})`);
  const added = list[list.length - 1];
  assert.equal(list.length, 9);
  assert.equal(added.id, 201);
  assert.equal(added.price, 1550);
  assert.equal(added.stock, 4);
  assert.equal(added.tone, '#eee7fa');
});

test('editing keeps the id and card colour, deleting removes only that card', () => {
  const { json } = loadManage();
  const edited = json(`updateProduct(products, 173, { ...${newCard}, name: 'Pikachu (signed)', serial: 'PC-151-173' })`);
  const pikachu = edited.find(card => card.id === 173);
  assert.equal(edited.length, 8);
  assert.equal(pikachu.name, 'Pikachu (signed)');
  assert.equal(pikachu.tone, '#f5e4b9');

  const afterDelete = json('deleteProduct(products, 168)');
  assert.equal(afterDelete.length, 7);
  assert.equal(afterDelete.some(card => card.id === 168), false);
});

test('stock updates reject negative, decimal and empty values', () => {
  const { json } = loadManage();
  for (const value of ["'-1'", "'2.5'", "''"]) {
    assert.equal(json(`updateStock(products, 173, ${value})`).error, 'Stock must be a whole number (0 or more).');
  }
  const result = json("updateStock(products, 173, '12')");
  assert.equal(result.error, '');
  assert.equal(result.products.find(card => card.id === 173).stock, 12);
});

test('stock status and summary count low and sold out cards', () => {
  const { run, json } = loadManage();
  assert.equal(run('stockStatus(0)'), 'Out of stock');
  assert.equal(run('stockStatus(2)'), 'Low stock');
  assert.equal(run('stockStatus(3)'), 'In stock');
  // sample stock is 3, 7, 4, 5, 2, 0, 6 and 1
  assert.deepEqual(json('stockSummary(products)'), { products: 8, units: 28, low: 2, out: 1 });
});

test('the low stock filter only lists cards with 2 or fewer copies', () => {
  const { run, elements } = loadManage();
  elements.get('#low-only').checked = true;
  run('renderStock()');
  const names = [...elements.get('#stock-rows').innerHTML.matchAll(/<strong>([^<]+)<\/strong>/g)].map(match => match[1]);
  assert.deepEqual(names, ['Squirtle', 'Charmander', 'Blastoise ex']);
});
