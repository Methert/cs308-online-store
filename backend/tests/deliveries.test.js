// Delivery list (GET /api/deliveries) and order status update (PATCH /api/orders/:id/status)
// for the product manager (requirement 12).
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const { ROLES } = require('../src/constants/roles');

function setup() {
  const ctx = createTestApp();
  const pm = ctx.bearerFor(ROLES.PRODUCT_MANAGER);
  return { ...ctx, pm };
}

describe('GET /api/deliveries', () => {
  test('lists one row per ordered product with the requirement 12 fields', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ items: [{ quantity: 2, unitPrice: 25 }] });

    const res = await request(app).get('/api/deliveries').set('Authorization', pm);

    expect(res.status).toBe(200);
    expect(res.body.data.deliveries).toEqual([
      {
        deliveryId: 100,
        orderId: 1,
        customerId: 1,
        customerName: 'Ash Ketchum',
        productId: 1,
        productName: 'Card 1',
        quantity: 2,
        totalPrice: 50,
        deliveryAddress: 'Pallet Town, Route 1',
        status: 'processing',
        completed: false,
        orderedAt: expect.any(String),
      },
    ]);
  });

  test('an order with two products gives two rows', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({
      items: [
        { quantity: 1, unitPrice: 10 },
        { quantity: 3, unitPrice: 5 },
      ],
    });

    const res = await request(app).get('/api/deliveries').set('Authorization', pm);

    expect(res.body.data.deliveries.map((d) => d.totalPrice)).toEqual([10, 15]);
  });

  test('leaves cancelled orders out', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'processing' });
    deliveries.addOrder({ status: 'cancelled' });

    const res = await request(app).get('/api/deliveries').set('Authorization', pm);

    expect(res.body.data.deliveries.map((d) => d.orderId)).toEqual([1]);
  });

  test('marks delivered orders as completed', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'in_transit' });
    deliveries.addOrder({ status: 'delivered' });

    const res = await request(app).get('/api/deliveries').set('Authorization', pm);

    expect(res.body.data.deliveries.map((d) => d.completed)).toEqual([false, true]);
  });

  test('shows the oldest orders first', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ createdAt: new Date('2026-11-20') });
    deliveries.addOrder({ createdAt: new Date('2026-11-10') });

    const res = await request(app).get('/api/deliveries').set('Authorization', pm);

    expect(res.body.data.deliveries.map((d) => d.orderId)).toEqual([2, 1]);
  });

  test('filters by status', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'processing' });
    deliveries.addOrder({ status: 'in_transit' });
    deliveries.addOrder({ status: 'delivered' });

    const res = await request(app)
      .get('/api/deliveries?status=in_transit')
      .set('Authorization', pm);

    expect(res.body.data.deliveries.map((d) => d.status)).toEqual(['in_transit']);
    expect(res.body.data.pagination.total).toBe(1);
  });

  test('splits the list into pages', async () => {
    const { app, pm, deliveries } = setup();
    for (let i = 0; i < 5; i++) deliveries.addOrder();

    const res = await request(app).get('/api/deliveries?limit=2&page=3').set('Authorization', pm);

    expect(res.body.data.deliveries).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({ page: 3, limit: 2, total: 5, totalPages: 3 });
  });

  test('an empty list is fine', async () => {
    const { app, pm } = setup();

    const res = await request(app).get('/api/deliveries').set('Authorization', pm);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      deliveries: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  test.each([
    ['status=cancelled', 'status'],
    ['status=shipped', 'status'],
    ['page=0', 'page'],
    ['limit=500', 'limit'],
    ['limit=abc', 'limit'],
  ])('rejects ?%s with 400', async (query, field) => {
    const { app, pm } = setup();

    const res = await request(app).get(`/api/deliveries?${query}`).set('Authorization', pm);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid query parameters');
    expect(res.body.details[0].field).toBe(field);
  });
});

describe('PATCH /api/orders/:id/status', () => {
  function patchStatus(app, auth, id, body) {
    return request(app).patch(`/api/orders/${id}/status`).set('Authorization', auth).send(body);
  }

  test('moves a processing order to in_transit', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'processing' });

    const res = await patchStatus(app, pm, 1, { status: 'in_transit' });

    expect(res.status).toBe(200);
    expect(res.body.data.order).toMatchObject({ id: 1, status: 'in_transit', totalPrice: 10 });
    expect(deliveries.orders[0].status).toBe('in_transit');
  });

  test('moves an in_transit order to delivered', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'in_transit' });

    const res = await patchStatus(app, pm, 1, { status: 'delivered' });

    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('delivered');
  });

  test('cannot skip a step: processing straight to delivered is refused', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'processing' });

    const res = await patchStatus(app, pm, 1, { status: 'delivered' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('An order in "processing" can only move to "in_transit"');
    expect(deliveries.orders[0].status).toBe('processing');
  });

  test('cannot go back: in_transit to in_transit again is refused', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'in_transit' });

    const res = await patchStatus(app, pm, 1, { status: 'in_transit' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('The order is already in_transit');
  });

  test('a delivered order cannot change any more', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'delivered' });

    const res = await patchStatus(app, pm, 1, { status: 'in_transit' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('The order is already delivered');
  });

  test('a cancelled order cannot be shipped', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'cancelled' });

    const res = await patchStatus(app, pm, 1, { status: 'in_transit' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('A cancelled order cannot be shipped');
  });

  test('if the order changed at the same moment (e.g. cancelled), answers 409', async () => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder({ status: 'processing' });
    // The customer cancels between our read and our update.
    const realChange = deliveries.changeStatus;
    deliveries.changeStatus = async (...args) => {
      deliveries.orders[0].status = 'cancelled';
      return realChange(...args);
    };

    const res = await patchStatus(app, pm, 1, { status: 'in_transit' });

    expect(res.status).toBe(409);
    expect(deliveries.orders[0].status).toBe('cancelled');
  });

  test('gives 404 for an order that does not exist', async () => {
    const { app, pm } = setup();

    const res = await patchStatus(app, pm, 99, { status: 'in_transit' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Order not found' });
  });

  test.each(['abc', '0', '1.5', '2147483648'])('gives 400 for the order id "%s"', async (id) => {
    const { app, pm } = setup();

    const res = await patchStatus(app, pm, id, { status: 'in_transit' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Order id must be a positive whole number' });
  });

  test.each([
    [{}, 'no status'],
    [{ status: 'processing' }, 'going back to processing'],
    [{ status: 'cancelled' }, 'cancelling (that is the customer’s action)'],
    [{ status: 'IN_TRANSIT' }, 'wrong letter case'],
    [{ status: 2 }, 'a number'],
  ])('rejects %p (%s) with 400', async (body) => {
    const { app, pm, deliveries } = setup();
    deliveries.addOrder();

    const res = await patchStatus(app, pm, 1, body);

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toEqual({
      field: 'status',
      message: 'status must be one of: in_transit, delivered',
    });
  });
});
