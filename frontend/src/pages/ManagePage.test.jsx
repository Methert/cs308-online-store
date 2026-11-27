import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, test, vi } from 'vitest';
import { api, customer } from '../test/api-fixture.js';
import { App } from '../App.jsx';
import { readInventory } from '../state/inventory.js';
import { ShopProvider } from '../state/ShopContext.jsx';

async function renderManage() {
  api.signIn({ ...customer, role: 'product_manager' });
  const view = render(<StrictMode><MemoryRouter initialEntries={['/manage']}>
    <ShopProvider><App /></ShopProvider>
  </MemoryRouter></StrictMode>);
  await screen.findByRole('heading', { name: 'Manage products', exact: true });
  return view;
}

// the number under a summary box label, "Low stock" is also used in the table so only look at <p>
function statValue(label) {
  return screen.getByText(label, { selector: 'p' }).nextSibling.textContent;
}

test('a new product is checked and then added to the list', async () => {
  const user = userEvent.setup();
  await renderManage();
  expect(screen.getAllByRole('rowheader')).toHaveLength(8);
  await user.click(screen.getByRole('button', { name: 'Add product' }));
  const form = within(screen.getByRole('dialog', { name: 'Add a product' }));
  await user.click(form.getByRole('button', { name: 'Add product' }));
  expect(form.getByRole('alert').textContent).toContain('Name is required.');
  expect(form.getByRole('alert').textContent).toContain('Price must be more than $0.');

  await user.type(form.getByLabelText('Name'), 'Mewtwo');
  await user.type(form.getByLabelText('Model'), '150/165');
  await user.type(form.getByLabelText('Serial number'), 'pc-151-173');
  await user.selectOptions(form.getByLabelText('Condition'), 'mint');
  await user.selectOptions(form.getByLabelText('Rarity'), 'ultra');
  await user.type(form.getByLabelText('Price ($)'), '15');
  await user.type(form.getByLabelText('Quantity in stock'), '3');
  await user.type(form.getByLabelText('Warranty status'), '30-day authenticity guarantee');
  await user.type(form.getByLabelText('Distributor'), 'The Pokémon Company International');
  await user.type(form.getByLabelText('Description'), 'Mewtwo floats in a purple glow.');
  await user.click(form.getByRole('button', { name: 'Add product' }));
  expect(form.getByRole('alert').textContent).toBe('Serial number pc-151-173 is already used by Pikachu.');

  await user.clear(form.getByLabelText('Serial number'));
  await user.type(form.getByLabelText('Serial number'), 'PC-151-150');
  await user.click(form.getByRole('button', { name: 'Add product' }));
  expect(screen.getByText('Mewtwo was added.')).toBeTruthy();
  expect(screen.getByRole('rowheader', { name: 'Mewtwo' })).toBeTruthy();
  expect(readInventory().at(-1)).toMatchObject({ id: 201, name: 'Mewtwo', price: 1500, stock: 3, condition: 'mint', rarity: 'ultra' });
});

test('editing a product keeps it in place with the new price', async () => {
  const user = userEvent.setup();
  await renderManage();
  await user.click(screen.getByRole('button', { name: 'Edit Pikachu' }));
  const form = within(screen.getByRole('dialog', { name: 'Edit Pikachu' }));
  expect(form.getByLabelText('Price ($)').value).toBe('22.50');
  await user.clear(form.getByLabelText('Price ($)'));
  await user.type(form.getByLabelText('Price ($)'), '24');
  await user.click(form.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByText('Pikachu was saved.')).toBeTruthy();
  const row = screen.getByRole('rowheader', { name: 'Pikachu' }).closest('tr');
  expect(within(row).getByText('$24.00')).toBeTruthy();
  expect(readInventory()[1]).toMatchObject({ id: 173, price: 2400 });
});

test('deleting a product asks for confirmation first', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  await renderManage();
  await user.click(screen.getByRole('button', { name: 'Delete Charmander' }));
  expect(screen.getByRole('rowheader', { name: 'Charmander' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Delete Charmander' }));
  expect(screen.queryByRole('rowheader', { name: 'Charmander' })).toBeNull();
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Charmander was deleted.')).toBeTruthy();
  expect(readInventory()).toHaveLength(7);
});

test('the stock tab shows totals, filters low stock and saves new quantities', async () => {
  const user = userEvent.setup();
  await renderManage();
  await user.click(screen.getByRole('button', { name: 'Stock' }));
  expect(statValue('Cards in stock')).toBe('28');
  expect(statValue('Low stock')).toBe('2');
  await user.click(screen.getByRole('checkbox', { name: 'Show only low or out of stock' }));
  expect(screen.getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(['Squirtle', 'Charmander', 'Blastoise ex']);

  await user.clear(screen.getByRole('spinbutton', { name: 'Stock for Squirtle' }));
  await user.click(screen.getByRole('button', { name: 'Save stock for Squirtle' }));
  expect(screen.getByRole('alert').textContent).toBe('Squirtle: Stock must be a whole number (0 or more).');

  await user.clear(screen.getByRole('spinbutton', { name: 'Stock for Blastoise ex' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Stock for Blastoise ex' }), '4');
  await user.click(screen.getByRole('button', { name: 'Save stock for Blastoise ex' }));
  expect(screen.getByText('Blastoise ex now has 4 in stock.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(['Squirtle', 'Charmander']);
  expect(statValue('Cards in stock')).toBe('31');
  expect(readInventory().find(product => product.id === 170).stock).toBe(2);
});

test('a customer cannot open the management preview', async () => {
  api.signIn(customer);
  render(<StrictMode><MemoryRouter initialEntries={['/manage']}><ShopProvider><App /></ShopProvider></MemoryRouter></StrictMode>);
  expect(await screen.findByRole('heading', { name: 'Product manager access required' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
});
