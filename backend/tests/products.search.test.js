// Search by name or description, sort by price or popularity (requirement 7):
//   GET /api/products?q=...&sort=price_asc|price_desc|popularity|name_asc|newest
const request = require('supertest');
const { createTestApp } = require('./helpers/testApp');
const { seedCatalog } = require('./helpers/inMemoryCatalogRepositories');

async function setup() {
  const ctx = createTestApp();
  const seeded = await seedCatalog(ctx.catalog);
  return { ...ctx, seeded };
}

const names = (res) => res.body.data.products.map((p) => p.name);

describe('search (?q=)', () => {
  test('finds products by name', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=pikachu');

    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Pikachu']);
  });

  test('finds products by description too', async () => {
    const { app } = await setup();

    // "Charizard" is in Blastoise's description, not in its name.
    const res = await request(app).get('/api/products?q=charizard');

    expect(names(res)).toEqual(['Blastoise', 'Charizard', 'Charizard ex']);
  });

  test('a word that is only in a description is found', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=lizard');

    expect(names(res)).toEqual(['Charmander']);
  });

  test('ignores letter case', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=PiKaChU');

    expect(names(res)).toEqual(['Pikachu']);
  });

  test('ignores spaces around the search text', async () => {
    const { app } = await setup();

    const res = await request(app).get(`/api/products?q=${encodeURIComponent('  pikachu  ')}`);

    expect(names(res)).toEqual(['Pikachu']);
  });

  test('finds part of a word', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=chu');

    expect(names(res)).toEqual(['Pikachu']);
  });

  test('keeps sold-out cards in the results (requirement 7)', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=charmander');

    expect(res.body.data.products).toEqual([
      expect.objectContaining({ name: 'Charmander', stockQuantity: 0, inStock: false }),
    ]);
  });

  test('does not find removed products', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=removed');

    expect(res.body.data.products).toEqual([]);
  });

  test('no match gives an empty list, not an error', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=mewtwo');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      products: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  test('an empty q lists everything', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=');

    expect(res.body.data.pagination.total).toBe(5);
  });

  test('the total counts every match, not only the current page', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=charizard&limit=1');

    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 1, total: 3, totalPages: 3 });
  });

  test('rejects search text longer than 100 characters', async () => {
    const { app } = await setup();

    const res = await request(app).get(`/api/products?q=${'a'.repeat(101)}`);

    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('q');
  });

  test('rejects the q parameter given twice', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?q=pika&q=char');

    expect(res.status).toBe(400);
  });
});

describe('sort (?sort=)', () => {
  test('price_asc puts the cheapest first; equal prices keep a fixed order', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get('/api/products?sort=price_asc');

    const prices = res.body.data.products.map((p) => p.price);
    expect(prices).toEqual([22.5, 22.5, 36.9, 129.9, 450]);
    // Pikachu and Blastoise cost the same: the older product (lower id) comes first.
    expect(res.body.data.products[0].id).toBe(seeded.pikachu.id);
  });

  test('price_desc puts the most expensive first', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?sort=price_desc');

    expect(res.body.data.products.map((p) => p.price)).toEqual([450, 129.9, 36.9, 22.5, 22.5]);
  });

  test('popularity puts the best sellers first and shows the copies sold', async () => {
    const { app, catalog, seeded } = await setup();
    catalog.sales.set(seeded.pikachu.id, 12);
    catalog.sales.set(seeded.charmander.id, 30);
    catalog.sales.set(seeded.blastoise.id, 1);

    const res = await request(app).get('/api/products?sort=popularity');

    expect(res.body.data.products.map((p) => [p.name, p.soldCount])).toEqual([
      ['Charmander', 30],
      ['Pikachu', 12],
      ['Blastoise', 1],
      ['Charizard ex', 0],
      ['Charizard', 0],
    ]);
  });

  test('popularity works together with search and pages', async () => {
    const { app, catalog, seeded } = await setup();
    catalog.sales.set(seeded.baseCharizard.id, 4);
    catalog.sales.set(seeded.charizardEx.id, 9);

    const res = await request(app).get('/api/products?q=charizard&sort=popularity&limit=2');

    expect(names(res)).toEqual(['Charizard ex', 'Charizard']);
    expect(res.body.data.pagination.total).toBe(3);
  });

  test('price sort works together with a category filter', async () => {
    const { app, seeded } = await setup();

    const res = await request(app).get(
      `/api/products?categoryId=${seeded.sv151.id}&sort=price_desc`,
    );

    expect(names(res)).toEqual(['Charizard ex', 'Charmander', 'Pikachu']);
  });

  test('newest puts the most recently added product first', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?sort=newest');

    expect(names(res)).toEqual(['Blastoise', 'Charizard', 'Charmander', 'Pikachu', 'Charizard ex']);
  });

  test('sorted pages follow each other without gaps', async () => {
    const { app } = await setup();

    const page1 = await request(app).get('/api/products?sort=price_desc&limit=3&page=1');
    const page2 = await request(app).get('/api/products?sort=price_desc&limit=3&page=2');

    expect([...names(page1), ...names(page2)]).toEqual([
      'Charizard',
      'Charizard ex',
      'Charmander',
      'Pikachu',
      'Blastoise',
    ]);
  });

  test('rejects an unknown sort option and lists the allowed ones', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/products?sort=cheapest');

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([
      {
        field: 'sort',
        message: 'Sort must be one of: name_asc, price_asc, price_desc, popularity, newest',
      },
    ]);
  });
});
