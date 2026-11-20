// Tests for the card pictures served under /images (public/images).
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const snapshot = require('../prisma/data/card-snapshot.json');

describe('GET /images', () => {
  const { app } = createTestApp();

  test('serves a card picture as WebP that the React app may load from another port', async () => {
    const res = await request(app).get('/images/cards/sv03.5/199.webp');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  test('answers 404 in the usual JSON form for a missing picture', async () => {
    const res = await request(app).get('/images/cards/sv03.5/does-not-exist.webp');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  test('does not serve files outside public/images', async () => {
    const res = await request(app).get('/images/../../package.json');
    expect(res.status).toBe(404);
  });
});

describe('card snapshot pictures', () => {
  test('every card in the snapshot has its picture in public/images', () => {
    for (const card of snapshot.cards) {
      expect(card.imageUrl).toMatch(/^\/images\/cards\/.+\.webp$/);
      expect(fs.existsSync(path.join(__dirname, '..', 'public', card.imageUrl))).toBe(true);
    }
  });
});
