import { expect, test, vi } from 'vitest';
import { fieldErrors, request } from './api.js';
import { api, failure, response } from '../test/api-fixture.js';
import { eligiblePurchases } from './orders-api.js';

test('private and guest requests use their correct headers and JSON bodies', async () => {
  await request('/cart', { guestToken: 'guest-id' });
  expect(api.calls[0].options.headers).toMatchObject({ 'x-guest-token': 'guest-id' });
  expect(api.calls[0].options.headers.Authorization).toBeUndefined();
  await request('/auth/login', { method: 'POST', body: { email: 'customer@pokeshop.test', password: 'Customer123' } });
  expect(api.calls[1].body).toEqual({ email: 'customer@pokeshop.test', password: 'Customer123' });
});

test('structured server errors retain status and field messages', async () => {
  api.overrides.set('POST /api/auth/register', failure('Validation failed', 400, [{ field: 'taxId', message: 'Required' }]));
  const error = await request('/auth/register', { method: 'POST', body: {} }).catch(error => error);
  expect(error.status).toBe(400);
  expect(fieldErrors(error)).toEqual({ taxId: 'Required' });
});

test('204 does not try to read a JSON response', async () => {
  api.overrides.set('DELETE /api/cart', response(null, 204));
  expect(await request('/cart', { method: 'DELETE' })).toBeNull();
});

test('an unreadable success response becomes a visible request error', async () => {
  api.overrides.set('GET /api/cart', { ok: true, status: 200, json: async () => { throw new Error('HTML'); } });
  await expect(request('/cart')).rejects.toThrow('unreadable');
});

test('an API proxy outage gives an unavailable message even if the response is not JSON', async () => {
  api.overrides.set('GET /api/cart', { ok: false, status: 502, json: async () => { throw new Error('Proxy error'); } });
  await expect(request('/cart')).rejects.toThrow('temporarily unavailable');
});

test('timeouts have a useful error message and abort the network request', async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
  const result = request('/cart', { fetchImpl, timeout: 10 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(10);
  expect((await result).message).toContain('too long');
  vi.useRealTimers();
});

test('an incomplete success payload never turns into data silently', async () => {
  api.overrides.set('GET /api/cart', response({ html: 'not API data' }));
  await expect(request('/cart')).rejects.toThrow('incomplete response');
});

test('only delivered order-item IDs for the selected product are review candidates', () => {
  const orders = [
    { id: 1, status: 'delivered', items: [{ id: 10, productId: 173 }, { id: 11, productId: 193 }] },
    { id: 2, status: 'in_transit', items: [{ id: 12, productId: 173 }] },
    { id: 3, status: 'delivered', items: [{ id: 13, productId: 173 }] },
  ];
  expect(eligiblePurchases(orders, 173, [10])).toMatchObject([{ orderItemId: 13, orderId: 3 }]);
});
