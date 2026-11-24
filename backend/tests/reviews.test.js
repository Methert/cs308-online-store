const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');

describe('Reviews & Moderation API (Req #5 & #12)', () => {
  function setupWithOrders() {
    const ctx = createTestApp();
    ctx.reviewRepository.orderItems.push(
      { id: 1, productId: 42, order: { userId: 1, status: 'delivered' } },
      { id: 2, productId: 42, order: { userId: 2, status: 'in_transit' } },
      { id: 3, productId: 42, order: { userId: 3, status: 'processing' } },
      { id: 4, productId: 42, order: { userId: 4, status: 'delivered' } },
    );
    return ctx;
  }

  test('rejects review when user is not logged in', async () => {
    const { app } = setupWithOrders();
    const res = await request(app).post('/api/reviews').send({ orderItemId: 1, rating: 5 });
    expect(res.status).toBe(401);
  });

  test('rejects review if order is processing or in_transit (Req #5)', async () => {
    const { app, bearerFor } = setupWithOrders();
    const inTransit = await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 2))
      .send({ orderItemId: 2, rating: 5, comment: 'Nice card' });
    const processing = await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 3))
      .send({ orderItemId: 3, rating: 4 });

    expect(inTransit.status).toBe(403);
    expect(processing.status).toBe(403);
  });

  test('rejects reviewing another user’s delivered order item', async () => {
    const { app, bearerFor } = setupWithOrders();
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 99))
      .send({ orderItemId: 1, rating: 5 });
    expect(res.status).toBe(403);
  });

  test('rejects rating outside 1..5', async () => {
    const { app, bearerFor } = setupWithOrders();
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 1))
      .send({ orderItemId: 1, rating: 6 });
    expect(res.status).toBe(400);
  });

  test('prevents duplicate review for the same order item', async () => {
    const { app, bearerFor } = setupWithOrders();
    await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 1))
      .send({ orderItemId: 1, rating: 5 });
    const second = await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 1))
      .send({ orderItemId: 1, rating: 4 });
    expect(second.status).toBe(409);
  });

  test('publishes rating immediately while keeping comment pending (Req #5)', async () => {
    const { app, bearerFor } = setupWithOrders();
    const postRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 1))
      .send({ orderItemId: 1, rating: 4, comment: 'Clean holo surface!' });

    expect(postRes.status).toBe(201);
    expect(postRes.body.data.review.commentStatus).toBe('pending');

    const getRes = await request(app).get('/api/reviews/product/42');
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.ratingCount).toBe(1);
    expect(getRes.body.data.averageRating).toBe(4);
    expect(getRes.body.data.comments).toEqual([]);
  });

  test('shows comment publicly only after product_manager approves it (Req #5 & #12)', async () => {
    const { app, bearerFor } = setupWithOrders();
    const postRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 1))
      .send({ orderItemId: 1, rating: 5, comment: 'Fast shipping!' });

    const reviewId = postRes.body.data.review.id;
    const modRes = await request(app)
      .patch(`/api/reviews/${reviewId}/moderate`)
      .set('Authorization', bearerFor('product_manager', 50))
      .send({ decision: 'approved' });

    expect(modRes.status).toBe(200);
    expect(modRes.body.data.review.commentStatus).toBe('approved');

    const getRes = await request(app).get('/api/reviews/product/42');
    expect(getRes.body.data.comments).toHaveLength(1);
    expect(getRes.body.data.comments[0].comment).toBe('Fast shipping!');
  });

  test('keeps rating in average when product_manager rejects comment', async () => {
    const { app, bearerFor } = setupWithOrders();
    const postRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', bearerFor('customer', 1))
      .send({ orderItemId: 1, rating: 2, comment: 'Inappropriate text' });

    const reviewId = postRes.body.data.review.id;
    await request(app)
      .patch(`/api/reviews/${reviewId}/moderate`)
      .set('Authorization', bearerFor('product_manager', 50))
      .send({ decision: 'rejected' });

    const getRes = await request(app).get('/api/reviews/product/42');
    expect(getRes.body.data.ratingCount).toBe(1);
    expect(getRes.body.data.averageRating).toBe(2);
    expect(getRes.body.data.comments).toEqual([]);
  });

  test('blocks non-product_manager roles from pending queue and moderation', async () => {
    const { app, bearerFor } = setupWithOrders();
    const queueRes = await request(app)
      .get('/api/reviews/moderation/pending')
      .set('Authorization', bearerFor('sales_manager', 20));
    expect(queueRes.status).toBe(403);

    const modRes = await request(app)
      .patch('/api/reviews/1/moderate')
      .set('Authorization', bearerFor('customer', 1))
      .send({ decision: 'approved' });
    expect(modRes.status).toBe(403);
  });
});