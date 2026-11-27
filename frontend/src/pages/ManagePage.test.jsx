import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api, customer, failure, success } from '../test/api-fixture.js';
import { renderShop } from '../test/render-shop.jsx';

const manager = { ...customer, id: 7, name: 'Demo Manager', email: 'pm@pokeshop.test', role: 'product_manager' };
const category = { id: 3, name: '151', setCode: 'sv03.5', series: 'Scarlet & Violet', productCount: 8 };

// the products API for managers: the fixture cards plus the fields only managers get
function fakeProductsApi() {
  const products = api.products.map(product => ({
    ...product, serialNumber: `PC-151-${product.id}`, warrantyStatus: '30-day authenticity guarantee',
    distributor: 'The Pokémon Company International', category, cost: null, isActive: true,
  }));
  api.overrides.set('GET /api/products/manage', success({ products, pagination: { page: 1, limit: 100, total: products.length, totalPages: 1 } }));
  api.overrides.set('GET /api/categories', success({ categories: [category] }));
  return products;
}

async function renderManage() {
  api.signIn(manager);
  const products = fakeProductsApi();
  renderShop('/manage');
  await screen.findAllByRole('rowheader');
  return products;
}

// the number under a summary box label, "Low stock" is also used in the table so only look at <p>
function statValue(label) {
  return screen.getByText(label, { selector: 'p' }).nextSibling.textContent;
}

test('the product list comes from the products API with the manager token', async () => {
  await renderManage();
  expect(screen.getAllByRole('rowheader')).toHaveLength(8);
  const row = screen.getByRole('rowheader', { name: 'Pikachu' }).closest('tr');
  expect(within(row).getByText('PC-151-173')).toBeTruthy();
  expect(within(row).getByText('$22.50')).toBeTruthy();
  const call = api.calls.find(call => call.path === '/api/products/manage');
  expect(call.url).toContain('status=all');
  expect(call.options.headers.Authorization).toBe('Bearer token:7');
  expect(screen.getByRole('link', { name: 'Delivery list' }).getAttribute('href')).toBe('/deliveries');
});

test('a new product is checked, sent to the API and added to the list', async () => {
  const user = userEvent.setup();
  await renderManage();
  api.overrides.set('POST /api/products', ({ body }) => {
    // the server has its own checks, for example for the decimals of the price
    if (body.price === 15.999) return failure('Validation failed', 400, [{ field: 'price', message: 'Price can have at most 2 decimals' }]);
    return success({ product: { ...body, id: 301, category, imageUrl: null, cost: null, isActive: true } }, 201);
  });
  await user.click(screen.getByRole('button', { name: 'Add product' }));
  const form = within(screen.getByRole('dialog', { name: 'Add a product' }));
  await user.click(form.getByRole('button', { name: 'Add product' }));
  expect(form.getByRole('alert').textContent).toContain('Name is required.');
  expect(form.getByRole('alert').textContent).toContain('Choose a category.');
  expect(api.calls.some(call => call.method === 'POST' && call.path === '/api/products')).toBe(false);

  await user.type(form.getByLabelText('Name'), 'Mewtwo');
  await user.selectOptions(form.getByLabelText('Category'), '151');
  await user.type(form.getByLabelText('Model'), '150/165');
  await user.type(form.getByLabelText('Serial number'), 'PC-151-150');
  await user.selectOptions(form.getByLabelText('Condition'), 'mint');
  await user.type(form.getByLabelText('Rarity'), 'Ultra rare');
  await user.type(form.getByLabelText('Price ($)'), '15.999');
  await user.type(form.getByLabelText('Quantity in stock'), '3');
  await user.type(form.getByLabelText('Warranty status'), '30-day authenticity guarantee');
  await user.type(form.getByLabelText('Distributor'), 'The Pokémon Company International');
  await user.type(form.getByLabelText('Description'), 'Mewtwo floats in a purple glow.');
  await user.click(form.getByRole('button', { name: 'Add product' }));
  expect((await form.findByRole('alert')).textContent).toBe('Price can have at most 2 decimals');

  await user.clear(form.getByLabelText('Price ($)'));
  await user.type(form.getByLabelText('Price ($)'), '15');
  await user.click(form.getByRole('button', { name: 'Add product' }));
  expect(await screen.findByText('Mewtwo was added.')).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Add a product' })).toBeNull();
  expect(screen.getByRole('rowheader', { name: 'Mewtwo' })).toBeTruthy();
  expect(api.calls.filter(call => call.method === 'POST' && call.path === '/api/products').at(-1).body).toEqual({
    categoryId: 3, name: 'Mewtwo', model: '150/165', serialNumber: 'PC-151-150', rarity: 'Ultra rare', condition: 'mint',
    description: 'Mewtwo floats in a purple glow.', price: 15, warrantyStatus: '30-day authenticity guarantee',
    distributor: 'The Pokémon Company International', stockQuantity: 3,
  });
});

test('editing sends the details and the stock in their own requests', async () => {
  const user = userEvent.setup();
  const products = await renderManage();
  const pikachu = products.find(product => product.id === 173);
  api.overrides.set('PATCH /api/products/173', ({ body }) => success({ product: { ...pikachu, price: body.price } }));
  api.overrides.set('PATCH /api/products/173/stock', ({ body }) => success({ product: { ...pikachu, price: 24, stockQuantity: body.stockQuantity } }));
  await user.click(screen.getByRole('button', { name: 'Edit Pikachu' }));
  const form = within(screen.getByRole('dialog', { name: 'Edit Pikachu' }));
  expect(form.getByLabelText('Price ($)').value).toBe('22.50');
  expect(form.getByLabelText('Category').value).toBe('3');
  await user.clear(form.getByLabelText('Price ($)'));
  await user.type(form.getByLabelText('Price ($)'), '24');
  await user.clear(form.getByLabelText('Quantity in stock'));
  await user.type(form.getByLabelText('Quantity in stock'), '9');
  await user.click(form.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Pikachu was saved.')).toBeTruthy();

  const row = screen.getByRole('rowheader', { name: 'Pikachu' }).closest('tr');
  expect(within(row).getByText('$24.00')).toBeTruthy();
  expect(within(row).getByText('9')).toBeTruthy();
  const details = api.calls.find(call => call.method === 'PATCH' && call.path === '/api/products/173');
  expect(details.body).toMatchObject({ price: 24, serialNumber: 'PC-151-173', categoryId: 3 });
  expect(details.body).not.toHaveProperty('stockQuantity');
  expect(api.calls.find(call => call.path === '/api/products/173/stock').body).toEqual({ stockQuantity: 9 });
});

test('removing asks first, takes the product off sale and it can be put back', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const products = await renderManage();
  const charmander = products.find(product => product.name === 'Charmander');
  api.overrides.set(`DELETE /api/products/${charmander.id}`, success({ product: { ...charmander, isActive: false } }));
  api.overrides.set(`PATCH /api/products/${charmander.id}`, success({ product: charmander }));

  await user.click(screen.getByRole('button', { name: 'Remove Charmander' }));
  expect(api.calls.some(call => call.method === 'DELETE')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Remove Charmander' }));
  expect(await screen.findByText('Charmander was taken off sale.')).toBeTruthy();
  expect(screen.getByRole('rowheader', { name: 'Charmander (off sale)' })).toBeTruthy();
  expect(confirm).toHaveBeenCalledTimes(2);

  await user.click(screen.getByRole('button', { name: 'Put Charmander back on sale' }));
  expect(await screen.findByText('Charmander is on sale again.')).toBeTruthy();
  expect(screen.getByRole('rowheader', { name: 'Charmander' })).toBeTruthy();
  expect(api.calls.find(call => call.method === 'PATCH').body).toEqual({ isActive: true });
});

test('the stock tab shows totals, filters low stock and saves quantities through the API', async () => {
  const user = userEvent.setup();
  const products = await renderManage();
  const blastoise = products.find(product => product.name === 'Blastoise ex');
  api.overrides.set(`PATCH /api/products/${blastoise.id}/stock`, ({ body }) => success({ product: { ...blastoise, stockQuantity: body.stockQuantity } }));
  await user.click(screen.getByRole('button', { name: 'Stock' }));
  expect(statValue('Cards in stock')).toBe('28');
  expect(statValue('Low stock')).toBe('2');
  await user.click(screen.getByRole('checkbox', { name: 'Show only low or out of stock' }));
  expect(screen.getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(['Squirtle', 'Charmander', 'Blastoise ex']);

  await user.clear(screen.getByRole('spinbutton', { name: 'Stock for Squirtle' }));
  await user.click(screen.getByRole('button', { name: 'Save stock for Squirtle' }));
  expect(screen.getByRole('alert').textContent).toBe('Squirtle: Stock must be a whole number (0 or more).');
  expect(api.calls.some(call => call.path.endsWith('/stock'))).toBe(false);

  await user.clear(screen.getByRole('spinbutton', { name: 'Stock for Blastoise ex' }));
  await user.type(screen.getByRole('spinbutton', { name: 'Stock for Blastoise ex' }), '4');
  await user.click(screen.getByRole('button', { name: 'Save stock for Blastoise ex' }));
  expect(await screen.findByText('Blastoise ex now has 4 in stock.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getAllByRole('rowheader').map(cell => cell.textContent)).toEqual(['Squirtle', 'Charmander']);
  expect(statValue('Cards in stock')).toBe('31');
  expect(api.calls.find(call => call.path.endsWith('/stock')).body).toEqual({ stockQuantity: 4 });
});

test('a failed product request shows the error and can be tried again', async () => {
  const user = userEvent.setup();
  api.signIn(manager);
  fakeProductsApi();
  api.overrides.set('GET /api/products/manage', failure('Unavailable', 503));
  renderShop('/manage');
  expect((await screen.findByRole('alert')).textContent).toContain('Products could not be loaded. Unavailable');
  expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
  fakeProductsApi();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findAllByRole('rowheader')).toHaveLength(8);
});

test('a customer cannot open the management page', async () => {
  api.signIn(customer);
  renderShop('/manage');
  expect(await screen.findByRole('heading', { name: 'Product manager access required' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
  expect(api.calls.some(call => call.path === '/api/products/manage')).toBe(false);
});
