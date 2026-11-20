// Tests for the demo catalog built from the card snapshot (prisma/seed-catalog.js).
const {
  buildCatalog,
  rarityPrice,
  RARITY_PRICES,
  CONDITION_FACTORS,
} = require('../prisma/seed-catalog');

const sample = {
  sets: [
    {
      setCode: 'sv3pt5',
      name: '151',
      series: 'Scarlet & Violet',
      releaseDate: '2023-09-22',
      printedTotal: 165,
    },
    {
      setCode: 'base1',
      name: 'Base',
      series: 'Base',
      releaseDate: '1999-01-09',
      printedTotal: 102,
    },
  ],
  cards: [
    {
      setCode: 'sv3pt5',
      number: '199',
      name: 'Charizard ex',
      supertype: 'Pokémon',
      rarity: 'Special Illustration Rare',
      imageUrl: 'https://example.test/199.png',
    },
    {
      setCode: 'sv3pt5',
      number: '1',
      name: 'Bulbasaur',
      supertype: 'Pokémon',
      rarity: 'Common',
      imageUrl: 'https://example.test/1.png',
    },
    {
      setCode: 'base1',
      number: '4',
      name: 'Charizard',
      supertype: 'Pokémon',
      rarity: 'Holo Rare',
      imageUrl: 'https://example.test/4.png',
    },
  ],
};

describe('buildCatalog', () => {
  const { categories, products } = buildCatalog(sample);
  const bySerial = (serial) => products.find((p) => p.serialNumber === serial);

  test('each card set becomes a category with its set code, series and release date', () => {
    expect(categories).toHaveLength(2);
    expect(categories[0]).toMatchObject({
      setCode: 'sv3pt5',
      name: '151',
      series: 'Scarlet & Violet',
    });
    expect(categories[0].releaseDate.toISOString()).toBe('2023-09-22T00:00:00.000Z');
  });

  test('model is the card number in its set and the stock code includes the condition', () => {
    expect(bySerial('SV3PT5-199-NM')).toMatchObject({
      model: '199/165',
      condition: 'near_mint',
      setCode: 'sv3pt5',
    });
  });

  test('a common card is sold only in near mint condition', () => {
    const bulbasaur = products.filter((p) => p.name === 'Bulbasaur');
    expect(bulbasaur.map((p) => p.condition)).toEqual(['near_mint']);
  });

  test('a valuable card is also sold in excellent condition, for less', () => {
    const nearMint = bySerial('SV3PT5-199-NM');
    const excellent = bySerial('SV3PT5-199-EX');
    expect(nearMint.price).toBe(RARITY_PRICES['special illustration rare']);
    expect(excellent.price).toBeCloseTo(nearMint.price * CONDITION_FACTORS.excellent, 2);
  });

  test('vintage Base set cards cost more and also come as a played copy', () => {
    const nearMint = bySerial('BASE1-4-NM');
    expect(nearMint.price).toBe(RARITY_PRICES['holo rare'] * 4);
    expect(bySerial('BASE1-4-PL').price).toBe(nearMint.price * CONDITION_FACTORS.played);
  });

  test('stock codes are unique', () => {
    const serials = products.map((p) => p.serialNumber);
    expect(new Set(serials).size).toBe(serials.length);
  });

  test('the catalog is the same every time it is built', () => {
    expect(buildCatalog(sample)).toEqual(buildCatalog(sample));
  });

  test('a card from an unknown set is an error', () => {
    const broken = { sets: [], cards: [sample.cards[0]] };
    expect(() => buildCatalog(broken)).toThrow('unknown set sv3pt5');
  });
});

describe('the real card snapshot', () => {
  const { categories, products } = buildCatalog();

  test('has every requirement 9 field filled in for every product', () => {
    for (const product of products) {
      for (const field of [
        'name',
        'model',
        'serialNumber',
        'description',
        'warrantyStatus',
        'distributor',
        'rarity',
      ]) {
        expect(product[field]).toEqual(expect.any(String));
        expect(product[field].trim()).not.toBe('');
      }
      expect(product.price).toBeGreaterThan(0);
      expect(product.stockQuantity).toBeGreaterThanOrEqual(0);
    }
  });

  test('includes sold-out cards so search can show them (requirement 7)', () => {
    expect(products.some((p) => p.stockQuantity === 0)).toBe(true);
    expect(products.some((p) => p.stockQuantity > 0)).toBe(true);
  });

  test('has three card sets', () => {
    expect(categories.map((c) => c.setCode)).toEqual(['base1', 'sv03.5', 'swsh12.5']);
  });
});

describe('rarityPrice', () => {
  test('matches a rarity whatever its letter case', () => {
    expect(rarityPrice('Ultra Rare')).toBe(RARITY_PRICES['ultra rare']);
    expect(rarityPrice('Double rare')).toBe(RARITY_PRICES['double rare']);
  });

  test('uses the default price for a rarity it does not know', () => {
    expect(rarityPrice('Amazing Rare')).toBe(2);
  });
});

describe('card images', () => {
  test('every product uses a card picture served by the backend', () => {
    for (const product of buildCatalog().products) {
      expect(product.imageUrl).toMatch(/^\/images\/cards\/.+\.webp$/);
    }
  });
});
