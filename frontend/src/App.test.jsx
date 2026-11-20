import { StrictMode } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { App } from './App.jsx';
import { ShopProvider } from './state/ShopContext.jsx';
import { CART_KEY, USER_KEY } from './state/storage.js';

function renderStore(path = '/') {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}>
    <ShopProvider><App /></ShopProvider>
  </MemoryRouter></StrictMode>);
}

test('single-letter search matches names while descriptions require opting in', async () => {
  const user = userEvent.setup();
  renderStore();
  const search = screen.getByRole('searchbox', { name: 'Search cards' });
  await user.type(search, ' k ');
  expect(screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual(['Pikachu']);
  await user.clear(search);
  await user.type(search, 'rocky landscape');
  expect(screen.getByRole('heading', { name: 'No cards found' })).toBeTruthy();
  await user.click(screen.getByRole('checkbox', { name: 'Include descriptions' }));
  expect(screen.getByRole('button', { name: 'Sold out: Charmander' }).disabled).toBe(true);
  await user.click(screen.getByRole('checkbox', { name: 'Include descriptions' }));
  expect(screen.getByRole('heading', { name: 'No cards found' })).toBeTruthy();
});

test('rarity filters and price sorting compose', async () => {
  const user = userEvent.setup();
  renderStore();
  await user.click(screen.getByRole('button', { name: 'Special illustration rare', exact: true }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort cards' }), 'low');
  expect(screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent))
    .toEqual(['Venusaur ex', 'Blastoise ex', 'Charizard ex']);
});

test('product details show stock and enforce the bag limit', async () => {
  const user = userEvent.setup();
  renderStore();
  await user.click(screen.getByRole('button', { name: 'View Blastoise ex details' }));
  const details = within(screen.getByRole('dialog', { name: 'Blastoise ex' }));
  await user.click(details.getByRole('button', { name: 'Add to bag: Blastoise ex' }));
  expect(details.getByRole('button', { name: 'All in bag: Blastoise ex' }).disabled).toBe(true);
  await user.click(details.getByRole('button', { name: 'Close card details' }));
  expect(screen.getByRole('button', { name: 'Bag 1' })).toBeTruthy();
});

for (const route of ['/sign-in', '/sign-up']) {
  test(`bag survives ${route}, refresh, and sign-out with the correct quantities`, async () => {
    const user = userEvent.setup();
    const app = renderStore();
    await user.click(screen.getByRole('button', { name: 'Add to bag: Pikachu' }));
    await user.click(screen.getByRole('button', { name: 'Add to bag: Pikachu' }));
    await user.click(screen.getByRole('button', { name: 'Add to bag: Squirtle' }));
    await user.click(screen.getByRole('link', { name: route === '/sign-in' ? 'Sign in' : 'Sign up', exact: true }));
    if (route === '/sign-in') {
      await user.click(screen.getByRole('button', { name: 'Fill demo details' }));
      await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
    } else {
      await user.type(screen.getByLabelText('Display name'), 'Yavuz');
      await user.type(screen.getByLabelText('Email address'), 'demo@example.com');
      await user.type(screen.getByLabelText('Password', { exact: true }), 'sample-only');
      await user.type(screen.getByLabelText('Confirm password'), 'sample-only');
      await user.click(screen.getByRole('button', { name: 'Create account' }));
    }
    expect(screen.getByRole('button', { name: 'Bag 3' })).toBeTruthy();
    expect(screen.getByLabelText(route === '/sign-in' ? 'Signed in as Peko Trainer' : 'Signed in as Yavuz')).toBeTruthy();
    app.unmount();
    renderStore();
    await user.click(screen.getByRole('button', { name: 'Bag 3' }));
    const bag = within(screen.getByRole('dialog', { name: 'Your bag' }));
    expect(bag.getByText('$79.90')).toBeTruthy();
    expect(bag.getByLabelText('Quantity 2')).toBeTruthy();
    await user.click(bag.getByRole('button', { name: 'Close bag' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Bag 3' })).toBeTruthy();
  });
}

test('failed sign-in leaves the saved bag and guest state intact', async () => {
  const user = userEvent.setup();
  localStorage.setItem(CART_KEY, JSON.stringify([{ id: 173, quantity: 2 }]));
  renderStore('/sign-in');
  await user.type(screen.getByLabelText('Email address'), 'trainer@example.com');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'incorrect');
  await user.click(screen.getByRole('button', { name: 'Sign in', exact: true }));
  expect(screen.getByRole('alert').textContent).toContain('Use the demo email');
  expect(screen.getByRole('button', { name: 'Bag 2' })).toBeTruthy();
  expect(sessionStorage.getItem(USER_KEY)).toBeNull();
});

test('sign-up validates confirmation and preserves the entered display name', async () => {
  const user = userEvent.setup();
  renderStore('/sign-up');
  await user.type(screen.getByLabelText('Display name'), '<b>Trainer</b>');
  await user.type(screen.getByLabelText('Email address'), 'demo@example.com');
  await user.type(screen.getByLabelText('Password', { exact: true }), 'sample-only');
  await user.type(screen.getByLabelText('Confirm password'), 'different');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByRole('alert').textContent).toBe('Your passwords do not match.');
  await user.click(screen.getByRole('button', { name: 'Show', exact: true }));
  expect(screen.getByLabelText('Password', { exact: true }).type).toBe('text');
  expect(screen.getByLabelText('Confirm password').type).toBe('text');
  await user.clear(screen.getByLabelText('Confirm password'));
  await user.type(screen.getByLabelText('Confirm password'), 'sample-only');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByLabelText('Signed in as <b>Trainer</b>').textContent).toBe('<b>Trainer</b>');
});

test('removing an item stays removed after remounting the app', async () => {
  const user = userEvent.setup();
  localStorage.setItem(CART_KEY, JSON.stringify([{ id: 173, quantity: 1 }]));
  const app = renderStore();
  await user.click(screen.getByRole('button', { name: 'Bag 1' }));
  await user.click(screen.getByRole('button', { name: 'Remove Pikachu' }));
  app.unmount();
  renderStore();
  expect(screen.getByRole('button', { name: 'Bag 0' })).toBeTruthy();
  expect(localStorage.getItem(CART_KEY)).toBeNull();
});

test('changes from another tab update the rendered bag', async () => {
  renderStore();
  const saved = JSON.stringify([{ id: 173, quantity: 2 }]);
  act(() => {
    localStorage.setItem(CART_KEY, saved);
    window.dispatchEvent(new StorageEvent('storage', { key: CART_KEY, storageArea: localStorage, newValue: saved }));
  });
  expect(screen.getByRole('button', { name: 'Bag 2' })).toBeTruthy();
  act(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage, newValue: null }));
  });
  expect(screen.getByRole('button', { name: 'Bag 0' })).toBeTruthy();
});

test('blocked saving keeps the bag usable and exposes a warning', async () => {
  const user = userEvent.setup();
  renderStore();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  await user.click(screen.getByRole('button', { name: 'Add to bag: Pikachu' }));
  await user.click(screen.getByRole('button', { name: 'Bag 1' }));
  expect(within(screen.getByRole('dialog', { name: 'Your bag' })).getByRole('status').textContent)
    .toContain('could not save');
});
