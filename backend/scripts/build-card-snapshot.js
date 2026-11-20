// Rebuilds prisma/data/card-snapshot.json, the card list the demo catalog is seeded from.
//   node scripts/build-card-snapshot.js
//
// Source: the open Pokémon TCG data on GitHub (github.com/PokemonTCG/pokemon-tcg-data).
// Only facts are copied: set names, card names, numbers and rarities. Card images are NOT
// downloaded; the snapshot keeps their URLs on images.pokemontcg.io.
// Run this only when the chosen sets change; the seed itself works offline from the snapshot.
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master';
const OUTPUT = path.join(__dirname, '..', 'prisma', 'data', 'card-snapshot.json');

// The sets the shop sells, and at most how many cards of each rarity to take from each set.
const SET_CODES = ['base1', 'sv3pt5', 'swsh12pt5'];
const CARDS_PER_RARITY = 3;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function main() {
  const allSets = await fetchJson(`${SOURCE}/sets/en.json`);
  const sets = [];
  const cards = [];

  for (const code of SET_CODES) {
    const set = allSets.find((s) => s.id === code);
    if (!set) throw new Error(`Set ${code} not found`);
    sets.push({
      setCode: set.id,
      name: set.name,
      series: set.series,
      releaseDate: set.releaseDate.replaceAll('/', '-'),
      printedTotal: set.printedTotal,
    });

    // Lowest card numbers first within each rarity, so the choice is stable between runs.
    const setCards = (await fetchJson(`${SOURCE}/cards/en/${code}.json`))
      .filter((card) => card.rarity && card.images)
      .sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));
    const taken = {};
    for (const card of setCards) {
      taken[card.rarity] = (taken[card.rarity] ?? 0) + 1;
      if (taken[card.rarity] > CARDS_PER_RARITY) continue;
      cards.push({
        setCode: code,
        number: card.number,
        name: card.name,
        supertype: card.supertype,
        rarity: card.rarity,
        imageUrl: card.images.small,
      });
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify({ source: SOURCE, sets, cards }, null, 2) + '\n');
  console.log(
    `Wrote ${sets.length} sets and ${cards.length} cards to ${path.relative(process.cwd(), OUTPUT)}`,
  );
}

main().catch((err) => {
  console.error('Could not build the card snapshot:', err.message);
  process.exitCode = 1;
});
