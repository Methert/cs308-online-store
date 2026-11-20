// Rebuilds the demo card data the catalog is seeded from:
//   - prisma/data/card-snapshot.json   card facts (sets, names, numbers, rarities)
//   - public/images/cards/<set>/<number>.webp   one picture per card
//   node scripts/build-card-snapshot.js
//
// Source: TCGdex (tcgdex.dev), an open, maintained Pokémon TCG database with MIT licensed data.
// The card pictures belong to The Pokémon Company; they are kept in this private repository
// for the course demo only.
// Run this only when the chosen sets change; the seed and the API work offline from the files.
const fs = require('fs');
const path = require('path');

const API = 'https://api.tcgdex.net/v2/en';
const OUTPUT = path.join(__dirname, '..', 'prisma', 'data', 'card-snapshot.json');
const IMAGE_DIR = path.join(__dirname, '..', 'public', 'images', 'cards');
// The URL path the backend serves IMAGE_DIR under (see the /images route in src/app.js).
const IMAGE_URL_PATH = '/images/cards';

// The sets the shop sells (TCGdex set IDs), and at most how many cards of each rarity to take.
const SET_IDS = ['base1', 'sv03.5', 'swsh12.5'];
const CARDS_PER_RARITY = 3;
// TCGdex serves each picture in several sizes and formats; "high.webp" is sharp and small.
const IMAGE_SUFFIX = '/high.webp';

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

// Downloads one picture. Returns false if the source has none, so the card is skipped.
async function downloadImage(url, file) {
  const res = await fetch(url);
  if (!res.ok || !/^image\//.test(res.headers.get('content-type') ?? '')) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return true;
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
  // Start from an empty folder so pictures of cards no longer chosen do not linger.
  fs.rmSync(IMAGE_DIR, { recursive: true, force: true });

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
      const fileName = `${set.id}/${card.localId}.webp`;
      if (!(await downloadImage(card.image + IMAGE_SUFFIX, path.join(IMAGE_DIR, fileName)))) {
        continue;
      }
      taken[card.rarity] = (taken[card.rarity] ?? 0) + 1;
      cards.push({
        setCode: set.id,
        number: card.localId,
        name: card.name,
        supertype: card.category,
        rarity: card.rarity,
        imageUrl: `${IMAGE_URL_PATH}/${fileName}`,
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
