// Rebuilds prisma/data/card-snapshot.json, the card list the demo catalog is seeded from.
//   node scripts/build-card-snapshot.js
//
// Source: TCGdex (tcgdex.dev), an open, maintained Pokémon TCG database. Its data is MIT
// licensed; the card images belong to The Pokémon Company and are only linked, never downloaded.
// Every card in the snapshot has an image link that answered 200 when the snapshot was built.
// Run this only when the chosen sets change; the seed itself works offline from the snapshot.
const fs = require('fs');
const path = require('path');

const API = 'https://api.tcgdex.net/v2/en';
const OUTPUT = path.join(__dirname, '..', 'prisma', 'data', 'card-snapshot.json');

// The sets the shop sells (TCGdex set IDs), and at most how many cards of each rarity to take.
const SET_IDS = ['base1', 'sv03.5', 'swsh12.5'];
const CARDS_PER_RARITY = 3;
// TCGdex serves each image in several sizes and formats; "high.webp" is sharp and small.
const IMAGE_SUFFIX = '/high.webp';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function imageWorks(url) {
  const res = await fetch(url, { method: 'HEAD' });
  return res.ok;
}

// Runs `task` on every item, at most `limit` at a time, keeping the original order.
async function mapLimited(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  const sets = [];
  const cards = [];

  for (const id of SET_IDS) {
    const set = await fetchJson(`${API}/sets/${id}`);
    sets.push({
      setCode: set.id,
      name: set.name,
      series: set.serie.name,
      releaseDate: set.releaseDate,
      printedTotal: set.cardCount.official,
    });

    // The set lists only names and numbers; rarity is on each card.
    const details = await mapLimited(
      set.cards.filter((card) => card.image),
      8,
      (card) => fetchJson(`${API}/cards/${encodeURIComponent(card.id)}`),
    );

    const taken = {};
    for (const card of details) {
      if (!card.rarity || card.rarity === 'None') continue;
      if ((taken[card.rarity] ?? 0) >= CARDS_PER_RARITY) continue;
      const imageUrl = card.image + IMAGE_SUFFIX;
      if (!(await imageWorks(imageUrl))) continue;
      taken[card.rarity] = (taken[card.rarity] ?? 0) + 1;
      cards.push({
        setCode: set.id,
        number: card.localId,
        name: card.name,
        supertype: card.category,
        rarity: card.rarity,
        imageUrl,
      });
    }
    console.log(`${set.name}: ${Object.values(taken).reduce((a, b) => a + b, 0)} cards`);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ source: API, sets, cards }, null, 2) + '\n');
  console.log(
    `Wrote ${sets.length} sets and ${cards.length} cards to ${path.relative(process.cwd(), OUTPUT)}`,
  );
}

main().catch((err) => {
  console.error('Could not build the card snapshot:', err.message);
  process.exitCode = 1;
});
