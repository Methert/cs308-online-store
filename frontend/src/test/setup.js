import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { installApiFixture } from './api-fixture.js';
import { resetCatalog, toCard } from '../state/catalog.js';

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value() { this.setAttribute('open', ''); },
});
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  },
});
window.scrollTo = vi.fn();

beforeEach(() => {
  const api = installApiFixture();
  resetCatalog(api.products.map(toCard));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});
