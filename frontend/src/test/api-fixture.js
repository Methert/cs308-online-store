import { vi } from 'vitest';
import { cards } from '../data/cards.js';
import { AUTH_KEY, GUEST_KEY } from '../state/storage.js';

export const guestId = '11111111-1111-4111-8111-111111111111';
export const customer = { id: 99, name: 'Demo Customer', email: 'customer@pokeshop.test', role: 'customer' };
export const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
export const success = (data, status = 200) => response({ data }, status);
export const failure = (message, status, details) => response({ error: message, ...(details ? { details } : {}) }, status);
export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// HTTP fixtures mirror the checked-in routes. They never substitute for a live API in the app.
export function createApiFixture() {
  const fixture = {
    products: cards.map(card => ({
      ...card, price: card.price / 100, stockQuantity: card.stock, condition: 'near_mint', model: `${card.id}/165`,
      category: { name: '151', setCode: 'sv03.5' }, imageUrl: null,
    })),
    guestCarts: new Map([[guestId, []]]), accountCarts: new Map([[customer.id, []]]),
    users: new Map([[`token:${customer.id}`, customer]]), reviews: new Map(), submittedIds: [],
    overrides: new Map(), calls: [],
    orders: [
      { id: 1001, userId: 99, status: 'delivered', createdAt: '2026-10-28T14:20:00Z', totalPrice: 68.70, deliveryAddress: '12 Sample Street, Istanbul 34710',
        items: [{ id: 501, productId: 166, quantity: 1, unitPrice: 28.90, product: { name: 'Bulbasaur' } }, { id: 502, productId: 193, quantity: 2, unitPrice: 19.90, product: { name: 'Mew ex' } }] },
      { id: 1002, userId: 99, status: 'in_transit', createdAt: '2026-11-09T09:05:00Z', totalPrice: 22.50, deliveryAddress: '12 Sample Street, Istanbul 34710',
        items: [{ id: 503, productId: 173, quantity: 1, unitPrice: 22.50, product: { name: 'Pikachu' } }] },
      { id: 1003, userId: 99, status: 'cancelled', createdAt: '2026-11-14T18:40:00Z', totalPrice: 59.90, deliveryAddress: '12 Sample Street, Istanbul 34710',
        items: [{ id: 504, productId: 198, quantity: 1, unitPrice: 59.90, product: { name: 'Venusaur ex' } }] },
    ],
    signIn(user = customer) {
      fixture.users.set(`token:${user.id}`, user);
      sessionStorage.setItem(AUTH_KEY, `token:${user.id}`);
      fixture.accountCarts.set(user.id, fixture.accountCarts.get(user.id) ?? []);
      return user;
    },
  };
  function cart(owner, authenticated) {
    const carts = authenticated ? fixture.accountCarts : fixture.guestCarts;
    if (!carts.has(owner)) carts.set(owner, []);
    return carts.get(owner);
  }
  fixture.fetch = vi.fn(async (url, options = {}) => {
    const parsed = new URL(url, 'http://shop.test');
    const path = parsed.pathname;
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    const token = options.headers?.Authorization?.replace('Bearer ', '');
    const user = fixture.users.get(token);
    const owner = user?.id ?? options.headers?.['x-guest-token'];
    const context = { url, path, method, body, options, user, owner };
    fixture.calls.push(context);
    const override = fixture.overrides.get(`${method} ${path}`);
    if (override) return typeof override === 'function' ? override(context) : override;
    if (path === '/api/auth/me') return user ? success({ user }) : failure('Token is invalid or expired', 401);
    if (path === '/api/auth/login') {
      if (body.email !== customer.email || body.password !== 'Customer123') return failure('Invalid email or password', 401);
      return success({ user: customer, token: `token:${customer.id}` });
    }
    if (path === '/api/auth/register') {
      const newUser = { id: 100, name: body.name, email: body.email, role: 'customer', taxId: body.taxId, homeAddress: body.homeAddress };
      fixture.users.set('token:100', newUser);
      return success({ user: newUser, token: 'token:100' }, 201);
    }
    if (path === '/api/products') return success({ products: fixture.products, pagination: { totalPages: 1 } });
    if (/^\/api\/products\/\d+$/.test(path)) {
      const product = fixture.products.find(item => item.id === Number(path.split('/').at(-1)));
      return product ? success({ product }) : failure('Product not found', 404);
    }
    if (token && !user) return failure('Token is invalid or expired', 401);
    if (path.startsWith('/api/cart')) {
      if (path === '/api/cart/merge') {
        if (!user) return failure('Authentication required', 401);
        const items = cart(body.guestToken, false);
        const target = cart(user.id, true);
        for (const item of items) {
          const existing = target.find(row => row.id === item.id);
          if (existing) existing.quantity += item.quantity;
          else target.push({ ...item });
        }
        fixture.guestCarts.delete(body.guestToken);
        return success({ merged: items.length });
      }
      if (!owner) return failure('Guest token required', 400);
      const items = cart(owner, Boolean(user));
      if (path === '/api/cart' && method === 'GET') return success({ items: items.map(item => ({ productId: item.id, quantity: item.quantity, product: fixture.products.find(product => product.id === item.id) })) });
      const id = body?.productId ?? Number(path.split('/').at(-1));
      const product = fixture.products.find(item => item.id === id);
      const existing = items.find(item => item.id === id);
      if (method === 'DELETE') {
        const index = items.findIndex(item => item.id === id);
        if (index >= 0) items.splice(index, 1);
        return response(null, 204);
      }
      const quantity = method === 'POST' ? (existing?.quantity ?? 0) + body.quantity : body.quantity;
      if (!product) return failure('Product not found', 404);
      if (quantity > product.stockQuantity) return failure('Not enough stock', 409);
      if (existing) existing.quantity = quantity;
      else items.push({ id, quantity });
      return success({}, method === 'POST' ? 201 : 200);
    }
    if (path === '/api/orders') {
      if (!user) return failure('Authentication required', 401);
      if (method === 'GET') return success({ orders: fixture.orders.filter(order => order.userId === user.id) });
      const items = cart(user.id, true);
      if (!items.length) return failure('Cart is empty', 400);
      if (items.some(item => item.quantity > fixture.products.find(product => product.id === item.id).stockQuantity)) return failure('Card ran out of stock', 409);
      const order = { id: 1004, userId: user.id, status: 'processing', createdAt: '2026-11-27T10:00:00Z', deliveryAddress: body.deliveryAddress,
        totalPrice: items.reduce((sum, item) => sum + fixture.products.find(product => product.id === item.id).price * item.quantity, 0),
        items: items.map((item, index) => ({ id: 510 + index, productId: item.id, quantity: item.quantity, unitPrice: fixture.products.find(product => product.id === item.id).price, product: { name: fixture.products.find(product => product.id === item.id).name } })),
      };
      for (const item of items) fixture.products.find(product => product.id === item.id).stockQuantity -= item.quantity;
      items.splice(0);
      fixture.orders.push(order);
      return success(order, 201);
    }
    if (path.startsWith('/api/reviews/product/')) {
      const id = Number(path.split('/').at(-1));
      return success(fixture.reviews.get(id) ?? { productId: id, ratingCount: 0, averageRating: 0, comments: [] });
    }
    if (path === '/api/reviews' && method === 'POST') {
      if (!user) return failure('Authentication required', 401);
      const order = fixture.orders.find(order => order.items.some(item => item.id === body.orderItemId));
      if (!order || order.userId !== user.id || order.status !== 'delivered') return failure('Products must be delivered before you can rate or comment', 403);
      if (fixture.submittedIds.includes(body.orderItemId)) return failure('You have already reviewed this purchased item', 409);
      fixture.submittedIds.push(body.orderItemId);
      const productId = order.items.find(item => item.id === body.orderItemId).productId;
      fixture.reviews.set(productId, { productId, ratingCount: 1, averageRating: body.rating, comments: [] });
      return success({ review: { id: 1, ...body, commentStatus: body.comment ? 'pending' : null } }, 201);
    }
    throw new Error(`Unexpected test request: ${method} ${path}`);
  });
  return fixture;
}

export let api;
export function installApiFixture() {
  api = createApiFixture();
  localStorage.setItem(GUEST_KEY, guestId);
  vi.stubGlobal('fetch', api.fetch);
  return api;
}
