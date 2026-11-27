import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { ProductDialog } from './ProductDialog.jsx';
import { ShopProvider } from '../state/ShopContext.jsx';
import { USER_KEY } from '../state/storage.js';

const trainer = { id: 'demo:trainer@example.com', name: 'Peko Trainer', email: 'trainer@example.com' };
const bulbasaur = {
  id: 166,
  name: 'Bulbasaur',
  model: '166/165',
  serialNumber: 'PK-166',
  rarity: 'Illustration Rare',
  conditionLabel: 'Near mint',
  description: 'A classic grass starter card.',
  stockQuantity: 3,
  price: 2890,
  tone: 'grass',
};
const pikachu = {
  ...bulbasaur,
  id: 173,
  name: 'Pikachu',
  model: '173/165',
  serialNumber: 'PK-173',
};

function renderDialog(card, account) {
  if (account) sessionStorage.setItem(USER_KEY, JSON.stringify(account));
  return render(
    <StrictMode>
      <ShopProvider>
        <ProductDialog card={card} onClose={() => {}} />
      </ShopProvider>
    </StrictMode>,
  );
}

test('shows only approved comments and asks guests to sign in', () => {
  renderDialog(pikachu, null);
  expect(screen.getByText('★ 4 / 5 (2 ratings)')).toBeTruthy();
  expect(screen.getByText('Centered print and crisp holo foil!')).toBeTruthy();
  expect(screen.queryByText('Waiting for manager moderation.')).toBeNull();
  expect(screen.getByText('Sign in to rate or comment on delivered purchases.')).toBeTruthy();
});

test('blocks review form when customer purchase is not delivered', () => {
  renderDialog(pikachu, trainer);
  expect(screen.queryByRole('button', { name: 'Submit review' })).toBeNull();
  expect(
    screen.getByText('Only customers with a delivered purchase can rate or comment on this card.'),
  ).toBeTruthy();
});

test('delivered buyer submits rating immediately while comment waits for approval', async () => {
  const user = userEvent.setup();
  renderDialog(bulbasaur, trainer);

  await user.selectOptions(screen.getByLabelText('Rating'), '4');
  await user.type(screen.getByLabelText('Comment'), 'Awesome card condition!');
  await user.click(screen.getByRole('button', { name: 'Submit review' }));

  expect(screen.getByText('★ 4 / 5 (1 rating)')).toBeTruthy();
  expect(screen.queryByText('Awesome card condition!')).toBeNull();
  expect(screen.getByText('You have already reviewed this card.')).toBeTruthy();
});