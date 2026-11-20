const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'account.js'), 'utf8');

function loadAccount(hash, storage = new Map()) {
  const fields = new Map();
  const routeEvents = {};
  const document = {
    querySelector(selector) {
      if (!fields.has(selector)) {
        fields.set(selector, {
          value: '',
          events: {},
          attributes: {},
          addEventListener(name, callback) { this.events[name] = callback; },
          setAttribute(name, value) { this.attributes[name] = value; },
          setCustomValidity(message) { this.validationMessage = message; },
          focus() { this.focused = true; },
          reset() { fields.forEach(field => { field.value = ''; }); },
          reportValidity() { return ![...fields.values()].some(field => field.validationMessage); },
        });
      }
      return fields.get(selector);
    },
  };
  const window = {
    location: { hash },
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    addEventListener(name, callback) { routeEvents[name] = callback; },
  };
  vm.runInNewContext(source, { document, window });
  return {
    field: selector => fields.get(selector),
    storage,
    navigate(hash) {
      window.location.hash = hash;
      routeEvents.hashchange();
    },
  };
}

test('direct sign-in route shows the form with only the necessary fields enabled', () => {
  const { field } = loadAccount('#sign-in');
  assert.equal(field('#catalog').hidden, true);
  assert.equal(field('#account').hidden, false);
  assert.equal(field('#account-confirm').disabled, true);
  assert.equal(field('#account-name').required, false);
  assert.equal(field('#account-password').autocomplete, 'current-password');
  assert.equal(field('#account-submit').disabled, false);
});

test('sign-up detects a mismatch and rechecks it when the password changes', () => {
  const { field } = loadAccount('#sign-up');
  assert.equal(field('#account-name').required, true);
  assert.equal(field('#account-confirm').disabled, false);
  field('#account-password').value = 'example password';
  field('#account-confirm').value = 'different password';
  field('#account-form').events.input();
  assert.equal(field('#account-confirm').validationMessage, 'Your passwords do not match.');
  field('#account-password').value = 'different password';
  field('#account-form').events.input();
  assert.equal(field('#account-confirm').validationMessage, '');
});

test('returning to the shop clears credentials and password visibility', () => {
  const { field, navigate } = loadAccount('#sign-up');
  field('#account-password').value = 'example password';
  field('#show-password').events.click();
  assert.equal(field('#account-password').type, 'text');
  assert.equal(field('#account-confirm').type, 'text');
  navigate('#catalog');
  assert.equal(field('#catalog').hidden, false);
  assert.equal(field('#account').hidden, true);
  assert.equal(field('#account-password').value, '');
  assert.equal(field('#account-password').type, 'password');
  assert.equal(field('#show-password').attributes['aria-pressed'], 'false');
});

test('demo sign-in shows the account indicator and saves only the display name', () => {
  const { field } = loadAccount('#sign-in');
  let prevented = false;
  field('#fill-demo').events.click();
  field('#account-form').events.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(field('#account-password').value, '');
  assert.equal(field('#guest-actions').hidden, true);
  assert.equal(field('#signed-in-account').hidden, false);
  assert.equal(field('#display-name').textContent, 'Peko Trainer');
  assert.equal(field('#account').hidden, true);
  assert.equal(field('#catalog').hidden, false);
});

test('incorrect demo credentials show an error and keep the guest header', () => {
  const { field } = loadAccount('#sign-in');
  field('#account-email').value = 'trainer@example.com';
  field('#account-password').value = 'incorrect';
  field('#account-form').events.submit({ preventDefault() {} });
  assert.equal(field('#guest-actions').hidden, false);
  assert.equal(field('#signed-in-account').hidden, true);
  assert.match(field('#account-error').textContent, /demo email and password/);
});

test('sign-up uses the trimmed chosen display name as text and restores it after reload', () => {
  const { field, storage } = loadAccount('#sign-up');
  field('#account-name').value = '  <b>Trainer & Friends</b>  ';
  field('#account-password').value = 'example password';
  field('#account-form').events.submit({ preventDefault() {} });
  assert.equal(field('#display-name').textContent, '<b>Trainer & Friends</b>');
  const saved = JSON.parse(storage.get('peko-cards-demo-user'));
  assert.deepEqual(saved, { displayName: '<b>Trainer & Friends</b>' });
  const reloaded = loadAccount('#catalog', storage);
  assert.equal(reloaded.field('#display-name').textContent, saved.displayName);
  assert.equal(reloaded.field('#signed-in-account').hidden, false);
});

test('sign-up rejects a whitespace-only display name', () => {
  const { field, storage } = loadAccount('#sign-up');
  field('#account-name').value = '   ';
  field('#account-form').events.submit({ preventDefault() {} });
  assert.equal(field('#account-name').validationMessage, 'Enter a display name.');
  assert.equal(storage.size, 0);
  assert.equal(field('#guest-actions').hidden, false);
});

test('sign-out clears the saved session and restores sign-in controls', () => {
  const storage = new Map([['peko-cards-demo-user', JSON.stringify({ displayName: 'Yavuz' })]]);
  const { field } = loadAccount('#catalog', storage);
  field('#sign-out').events.click();
  assert.equal(storage.size, 0);
  assert.equal(field('#guest-actions').hidden, false);
  assert.equal(field('#signed-in-account').hidden, true);
  assert.equal(field('#display-name').textContent, '');
  assert.equal(field('.sign-in-link').focused, true);
});

test('corrupt session data falls back to the guest header', () => {
  const { field } = loadAccount('#catalog', new Map([['peko-cards-demo-user', '{broken']]));
  assert.equal(field('#guest-actions').hidden, false);
});
