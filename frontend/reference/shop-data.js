'use strict';

// Shared data for checkout.html, orders.html and manage.html.
// Everything is kept in localStorage for now, store.js uses the same keys.
// TODO: load products and orders from the backend when the products API is ready.

const rarityLabels = {
  illustration: 'Illustration rare',
  special: 'Special illustration rare',
  ultra: 'Ultra rare',
};

// same values as the card_condition enum in the database
const conditionLabels = {
  mint: 'Mint',
  near_mint: 'Near mint',
  excellent: 'Excellent',
  good: 'Good',
  played: 'Played',
  poor: 'Poor',
};

// same values as the order_status enum in the database
const statusLabels = {
  processing: 'Processing',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// Copied from store.js, keep them the same.
// model, serial, condition, warranty and distributor are the extra product fields from Req. 9.
const sampleCards = [
  { id: 199, name: 'Charizard ex', rarity: 'special', price: 12900, stock: 3, tone: '#f3d3c4', description: 'Charizard soars between canyon walls in this special illustration rare.', model: '199/165', serial: 'PC-151-199', condition: 'near_mint', warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International' },
  { id: 173, name: 'Pikachu', rarity: 'illustration', price: 2250, stock: 7, tone: '#f5e4b9', description: 'Pikachu takes a stroll through a lively city street.', model: '173/165', serial: 'PC-151-173', condition: 'near_mint', warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International' },
  { id: 198, name: 'Venusaur ex', rarity: 'special', price: 5990, stock: 4, tone: '#dce8ce', description: 'Venusaur rests among leaves and flowers in this lush full-card illustration.', model: '198/165', serial: 'PC-151-198', condition: 'near_mint', warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International' },
  { id: 193, name: 'Mew ex', rarity: 'ultra', price: 1990, stock: 5, tone: '#eadbef', description: 'A full-art Mew ex with a pink and purple palette.', model: '193/165', serial: 'PC-151-193', condition: 'near_mint', warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International' },
  { id: 170, name: 'Squirtle', rarity: 'illustration', price: 3490, stock: 2, tone: '#d9e8f0', description: 'Squirtle plays by the shoreline in the first card of its illustrated evolution line.', model: '170/165', serial: 'PC-151-170', condition: 'near_mint', warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International' },
  { id: 168, name: 'Charmander', rarity: 'illustration', price: 3690, stock: 0, tone: '#f2ddc5', description: 'A small Charmander looks out over a rocky landscape.', model: '168/165', serial: 'PC-151-168', condition: 'near_mint', warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International' },
  { id: 166, name: 'Bulbasaur', rarity: 'illustration', price: 2890, stock: 6, tone: '#d6e8de', description: 'Bulbasaur sits beneath a canopy of green leaves.', model: '166/165', serial: 'PC-151-166', condition: 'near_mint', warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International' },
  { id: 200, name: 'Blastoise ex', rarity: 'special', price: 6990, stock: 1, tone: '#d9e2f1', description: 'Blastoise descends into deep water in this special illustration rare.', model: '200/165', serial: 'PC-151-200', condition: 'near_mint', warranty: '30-day authenticity guarantee', distributor: 'The Pokémon Company International' },
];

// A few old orders so the order history shows every status before the first checkout.
const sampleOrders = [
  {
    id: 1001,
    date: '2026-10-28T14:20:00.000Z',
    status: 'delivered',
    items: [
      { id: 166, name: 'Bulbasaur', price: 2890, quantity: 1 },
      { id: 193, name: 'Mew ex', price: 1990, quantity: 2 },
    ],
    total: 6870,
    customer: 'Peko Trainer',
    address: '12 Sample Street, Istanbul 34710',
    cardLast4: '4242',
  },
  {
    id: 1002,
    date: '2026-11-09T09:05:00.000Z',
    status: 'in_transit',
    items: [{ id: 173, name: 'Pikachu', price: 2250, quantity: 1 }],
    total: 2250,
    customer: 'Peko Trainer',
    address: '12 Sample Street, Istanbul 34710',
    cardLast4: '4242',
  },
  {
    id: 1003,
    date: '2026-11-14T18:40:00.000Z',
    status: 'cancelled',
    items: [{ id: 198, name: 'Venusaur ex', price: 5990, quantity: 1 }],
    total: 5990,
    customer: 'Peko Trainer',
    address: '12 Sample Street, Istanbul 34710',
    cardLast4: '5100',
  },
];

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = cents => currency.format(cents / 100);
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

function formatDate(isoDate) {
  return dateFormat.format(new Date(isoDate));
}

// product names and addresses are typed by people, so escape them before using innerHTML
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// every value we save is a list, so anything else counts as "nothing saved"
function readList(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(saved)) return saved;
  } catch {
    // storage is blocked or the saved value is broken
  }
  return fallback;
}

function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // the page still works, it just will not remember the change
  }
}

// a copy, so the sample lists above never change
function copyList(list) {
  return JSON.parse(JSON.stringify(list));
}

function loadProducts() {
  return readList('peko-products', copyList(sampleCards));
}

function saveProducts(products) {
  writeList('peko-products', products);
}

// the bag is saved by store.js as [id, quantity] pairs
function loadBag() {
  return readList('peko-bag', []);
}

function clearBag() {
  writeList('peko-bag', []);
}

function loadOrders() {
  return readList('peko-orders', copyList(sampleOrders));
}

function saveOrders(orders) {
  writeList('peko-orders', orders);
}
