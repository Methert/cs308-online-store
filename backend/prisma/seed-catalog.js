// Demo catalog: card sets become categories, cards become second-hand products.
// The card facts come from prisma/data/card-snapshot.json (see scripts/build-card-snapshot.js).
// Prices and stock are made up but stable: running the seed twice gives the same catalog.
const snapshot = require('./data/card-snapshot.json');

// Starting price of a near-mint card by rarity, matched without regard to case because the
// source writes rarities inconsistently ("Ultra Rare", "Double rare"). Unknown rarities use
// DEFAULT_PRICE.
const RARITY_PRICES = {
  common: 0.5,
  uncommon: 1,
  rare: 2.5,
  'double rare': 4,
  'holo rare': 8,
  'holo rare v': 3,
  'holo rare vstar': 4,
  'holo rare vmax': 6,
  'radiant rare': 5,
  'ultra rare': 12,
  'illustration rare': 15,
  'hyper rare': 40,
  'secret rare': 45,
  'special illustration rare': 60,
};
const DEFAULT_PRICE = 2;

function rarityPrice(rarity) {
  return RARITY_PRICES[rarity.toLowerCase()] ?? DEFAULT_PRICE;
}

// Cards from the 1999 Base set are vintage and cost more.
const VINTAGE_SETS = new Set(['base1']);
const VINTAGE_MULTIPLIER = 4;

// Price of each condition relative to near mint.
const CONDITION_FACTORS = {
  mint: 1.2,
  near_mint: 1,
  excellent: 0.85,
  good: 0.7,
  played: 0.5,
  poor: 0.3,
};

// Short codes for the stock code, for example SV03.5-199-NM.
const CONDITION_CODES = {
  mint: 'M',
  near_mint: 'NM',
  excellent: 'EX',
  good: 'GD',
  played: 'PL',
  poor: 'PR',
};

const WARRANTY = 'Authenticity guaranteed; condition as described';
const DISTRIBUTOR = 'The Pokémon Company International';

// A small stable number from a text, so stock does not change between seed runs.
function stableNumber(text) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash;
}

// Which conditions the shop has for a card: always near mint; valuable cards also in
// excellent condition; vintage cards also a cheaper played copy.
function conditionsFor(card, nearMintPrice) {
  const conditions = ['near_mint'];
  if (nearMintPrice >= 8) conditions.push('excellent');
  if (VINTAGE_SETS.has(card.setCode)) conditions.push('played');
  return conditions;
}

function roundPrice(value) {
  return Math.max(0.5, Math.round(value * 100) / 100);
}

// Turns the snapshot into rows for the categories and products tables.
function buildCatalog(data = snapshot) {
  const setsByCode = new Map(data.sets.map((set) => [set.setCode, set]));

  const categories = data.sets.map((set) => ({
    setCode: set.setCode,
    name: set.name,
    series: set.series,
    releaseDate: new Date(`${set.releaseDate}T00:00:00Z`),
    description: `${set.series} series, released ${set.releaseDate}, ${set.printedTotal} cards.`,
  }));

  const products = [];
  for (const card of data.cards) {
    const set = setsByCode.get(card.setCode);
    if (!set) throw new Error(`Card ${card.name} refers to unknown set ${card.setCode}`);

    const base = rarityPrice(card.rarity);
    const nearMintPrice = VINTAGE_SETS.has(card.setCode) ? base * VINTAGE_MULTIPLIER : base;

    for (const condition of conditionsFor(card, nearMintPrice)) {
      const serialNumber =
        `${card.setCode}-${card.number}-${CONDITION_CODES[condition]}`.toUpperCase();
      // About one product in six is out of stock, so search shows sold-out cards (requirement 7).
      const roll = stableNumber(serialNumber) % 6;
      products.push({
        setCode: card.setCode,
        name: card.name,
        model: `${card.number}/${set.printedTotal}`,
        serialNumber,
        rarity: card.rarity,
        condition,
        description: `${card.name} (${card.supertype}) from the ${set.name} set, ${set.series} series. ${card.rarity}.`,
        stockQuantity: roll === 0 ? 0 : roll,
        price: roundPrice(nearMintPrice * CONDITION_FACTORS[condition]),
        warrantyStatus: WARRANTY,
        distributor: DISTRIBUTOR,
        imageUrl: card.imageUrl,
      });
    }
  }

  return { categories, products };
}

// Creates or updates the catalog. Matching is by set code and stock code, so running it again
// updates the rows instead of duplicating them.
async function seedCatalog(prisma, data = snapshot) {
  const { categories, products } = buildCatalog(data);
  const categoryIds = new Map();

  for (const { setCode, ...category } of categories) {
    const row = await prisma.category.upsert({
      where: { setCode },
      update: category,
      create: { setCode, ...category },
    });
    categoryIds.set(setCode, row.id);
  }

  for (const { setCode, ...product } of products) {
    const row = { ...product, categoryId: categoryIds.get(setCode) };
    await prisma.product.upsert({
      where: { serialNumber: product.serialNumber },
      update: row,
      create: row,
    });
  }

  return { categories: categories.length, products: products.length };
}

module.exports = { buildCatalog, seedCatalog, rarityPrice, RARITY_PRICES, CONDITION_FACTORS };
