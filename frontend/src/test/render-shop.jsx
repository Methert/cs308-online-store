import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../App.jsx';
import { ShopProvider } from '../state/ShopContext.jsx';

export function renderShop(path = '/') {
  return render(<StrictMode><MemoryRouter initialEntries={[path]}><ShopProvider><App /></ShopProvider></MemoryRouter></StrictMode>);
}

export const readyBag = count => screen.findByRole('button', { name: `Bag ${count}` });
