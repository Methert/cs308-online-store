import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { api, deferred, failure, success } from '../test/api-fixture.js';
import { readyBag, renderShop } from '../test/render-shop.jsx';

async function openDetails(user, name = 'Bulbasaur') {
  await user.click(screen.getByRole('button', { name: `View ${name} details` }));
  return within(screen.getByRole('dialog', { name }));
}

test('public ratings and approved comments come from the API and comment text is escaped', async () => {
  const user = userEvent.setup();
  api.reviews.set(166, { ratingCount: 2, averageRating: 4, comments: [
    { id: 1, authorName: 'Misty', rating: 5, comment: '<img src=x onerror=alert(1)>' },
    { id: 2, authorName: 'Brock', rating: 3, comment: 'Pending comment', commentStatus: 'pending' },
  ] });
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user);
  expect(await dialog.findByText('4.0 out of 5 (2 ratings)')).toBeTruthy();
  expect(dialog.getByText('<img src=x onerror=alert(1)>').querySelector('img')).toBeNull();
  expect(dialog.queryByText('Pending comment')).toBeNull();
});

test('no ratings and no approved comments have explicit empty states', async () => {
  const user = userEvent.setup();
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user);
  expect(await dialog.findByText('No ratings yet')).toBeTruthy();
  expect(dialog.getByText('No approved comments yet.')).toBeTruthy();
  expect(dialog.getByRole('link', { name: 'Sign in' })).toBeTruthy();
});

test('reviews wait for the response without reporting an empty rating count', async () => {
  const user = userEvent.setup();
  const held = deferred();
  api.overrides.set('GET /api/reviews/product/166', () => held.promise);
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user);
  expect(await dialog.findByText('Loading ratings and reviews...')).toBeTruthy();
  expect(dialog.queryByText('No ratings yet')).toBeNull();
  await act(async () => held.resolve(success({ ratingCount: 1, averageRating: 5, comments: [] })));
  expect(await dialog.findByText('5.0 out of 5 (1 rating)')).toBeTruthy();
});

test('review load errors offer a retry independently of product details', async () => {
  const user = userEvent.setup();
  api.overrides.set('GET /api/reviews/product/166', failure('Unavailable', 503));
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user);
  expect((await dialog.findByRole('alert')).textContent).toContain('Reviews could not be loaded');
  expect(dialog.getByRole('button', { name: 'Add to bag: Bulbasaur' })).toBeTruthy();
  api.overrides.delete('GET /api/reviews/product/166');
  await user.click(dialog.getByRole('button', { name: 'Try again' }));
  expect(await dialog.findByText('No ratings yet')).toBeTruthy();
});

test('review submission uses a delivered order-item ID and never publishes a pending comment', async () => {
  const user = userEvent.setup();
  api.signIn();
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user);
  await user.selectOptions(await dialog.findByRole('combobox', { name: 'Your rating' }), '4');
  await user.type(dialog.getByLabelText('Comment (optional)'), 'Great condition');
  await user.click(dialog.getByRole('button', { name: 'Submit review' }));
  expect(await dialog.findByText('Your rating was submitted. Your comment will appear after manager approval.')).toBeTruthy();
  expect(api.calls.find(call => call.path === '/api/reviews' && call.method === 'POST').body).toEqual({ orderItemId: 501, rating: 4, comment: 'Great condition' });
  expect(await dialog.findByText('4.0 out of 5 (1 rating)')).toBeTruthy();
  expect(dialog.queryByText('Great condition')).toBeNull();
  expect(dialog.queryByRole('button', { name: 'Submit review' })).toBeNull();
});

test('in-transit purchases do not unlock the review form', async () => {
  const user = userEvent.setup();
  api.signIn();
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user, 'Pikachu');
  expect(await dialog.findByText(/No unreviewed delivered purchases/)).toBeTruthy();
  expect(dialog.queryByRole('button', { name: 'Submit review' })).toBeNull();
});

test('a purchase-check outage is distinct from having no delivered purchases', async () => {
  const user = userEvent.setup();
  api.signIn();
  api.overrides.set('GET /api/orders', failure('Unavailable', 503));
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user);
  expect((await dialog.findByRole('alert')).textContent).toContain('could not check your purchases');
  expect(dialog.queryByText(/No unreviewed delivered purchases/)).toBeNull();
});

test('a duplicate review is reported from the server without changing public ratings', async () => {
  const user = userEvent.setup();
  api.signIn();
  api.submittedIds.push(501);
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user);
  await user.click(await dialog.findByRole('button', { name: 'Submit review' }));
  expect((await dialog.findByRole('alert')).textContent).toContain('already reviewed');
  expect(dialog.getByText('No ratings yet')).toBeTruthy();
  expect(dialog.queryByRole('button', { name: 'Submit review' })).toBeNull();
});

test('an expired token during submission returns to signed-out state', async () => {
  const user = userEvent.setup();
  api.signIn();
  renderShop();
  await readyBag(0);
  const dialog = await openDetails(user);
  await dialog.findByRole('button', { name: 'Submit review' });
  api.users.delete('token:99');
  await user.click(dialog.getByRole('button', { name: 'Submit review' }));
  expect(await dialog.findByRole('link', { name: 'Sign in' })).toBeTruthy();
  expect(dialog.queryByRole('button', { name: 'Submit review' })).toBeNull();
});

test('a delayed review response for a previously closed card cannot replace the current card reviews', async () => {
  const user = userEvent.setup();
  const held = deferred();
  api.overrides.set('GET /api/reviews/product/173', () => held.promise);
  renderShop();
  await readyBag(0);
  let dialog = await openDetails(user, 'Pikachu');
  await dialog.findByText('Loading ratings and reviews...');
  await user.click(dialog.getByRole('button', { name: 'Close card details' }));
  dialog = await openDetails(user);
  await dialog.findByText('No ratings yet');
  await act(async () => held.resolve(success({ ratingCount: 1, averageRating: 1, comments: [{ id: 999, comment: 'Wrong card review', authorName: 'Other', rating: 1 }] })));
  await waitFor(() => expect(dialog.queryByText('Wrong card review')).toBeNull());
});
