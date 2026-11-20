'use strict';

const rarityLabels = {
  illustration: 'Illustration rare',
  special: 'Special illustration rare',
  ultra: 'Ultra rare',
};

// The card identities are from Scarlet & Violet 151. Prices and stock are sample data.
const cards = [
  { id: 199, name: 'Charizard ex', rarity: 'special', price: 12900, stock: 3, tone: '#f3d3c4', description: 'Charizard soars between canyon walls in this special illustration rare.' },
  { id: 173, name: 'Pikachu', rarity: 'illustration', price: 2250, stock: 7, tone: '#f5e4b9', description: 'Pikachu takes a stroll through a lively city street.' },
  { id: 198, name: 'Venusaur ex', rarity: 'special', price: 5990, stock: 4, tone: '#dce8ce', description: 'Venusaur rests among leaves and flowers in this lush full-card illustration.' },
  { id: 193, name: 'Mew ex', rarity: 'ultra', price: 1990, stock: 5, tone: '#eadbef', description: 'A full-art Mew ex with a pink and purple palette.' },
  { id: 170, name: 'Squirtle', rarity: 'illustration', price: 3490, stock: 2, tone: '#d9e8f0', description: 'Squirtle plays by the shoreline in the first card of its illustrated evolution line.' },
  { id: 168, name: 'Charmander', rarity: 'illustration', price: 3690, stock: 0, tone: '#f2ddc5', description: 'A small Charmander looks out over a rocky landscape.' },
  { id: 166, name: 'Bulbasaur', rarity: 'illustration', price: 2890, stock: 6, tone: '#d6e8de', description: 'Bulbasaur sits beneath a canopy of green leaves.' },
  { id: 200, name: 'Blastoise ex', rarity: 'special', price: 6990, stock: 1, tone: '#d9e2f1', description: 'Blastoise descends into deep water in this special illustration rare.' },
];

// manage.html saves the edited product list in localStorage. If it is there, the shop uses it.
try {
  const savedCards = JSON.parse(localStorage.getItem('peko-products'));
  if (Array.isArray(savedCards)) cards.splice(0, cards.length, ...savedCards);
} catch {
  // nothing saved yet or storage is blocked, keep the sample cards
}

const catalog = new Map(cards.map(card => [card.id, card]));
const bag = new Map();
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = cents => currency.format(cents / 100);
const search = document.querySelector('#search');
const sort = document.querySelector('#sort');
const filters = [...document.querySelectorAll('[data-rarity]')];
const grid = document.querySelector('#products');
const productDialog = document.querySelector('#product-dialog');
const productDetail = document.querySelector('#product-detail');
const cartDialog = document.querySelector('#cart-dialog');
const cartItems = document.querySelector('#cart-items');
const cartSummary = document.querySelector('#cart-summary');
const announcement = document.querySelector('#announcement');
const detailFeedback = document.querySelector('#detail-feedback');
let selectedRarity = 'all';
let announcementTimer;

function cardImage(card, { alt = '', loading = 'eager' } = {}) {
  return `<img src="assets/card-preview.svg" alt="${alt}" width="245" height="342" loading="${loading}" style="background-color: ${card.tone}">`;
}

function stockLabel(card) {
  return card.stock ? `<p class="stock">${card.stock} in stock</p>` : '<p class="stock sold">Out of stock</p>';
}

function addLabel(card) {
  if (!card.stock) return 'Sold out';
  return (bag.get(card.id) ?? 0) >= card.stock ? 'All in bag' : 'Add to bag';
}

function addButton(card) {
  const label = addLabel(card);
  return `<button class="add" type="button" data-add="${card.id}" aria-label="${label}: ${card.name}" ${label === 'Add to bag' ? '' : 'disabled'}>${label}</button>`;
}

function productTile(card) {
  return `<article class="product" style="--card-tone: ${card.tone}">
    <button class="product-art" type="button" data-details="${card.id}" aria-label="View ${card.name} details">
      <span class="rarity">${rarityLabels[card.rarity]}</span>${cardImage(card, { loading: 'lazy' })}
    </button>
    <div class="product-info">
      <p class="card-id">SCARLET &amp; VIOLET 151 · #${card.id}</p>
      <h3 class="card-title">${card.name}</h3>
      ${stockLabel(card)}
      <div class="product-bottom"><p class="price">${money(card.price)}</p>${addButton(card)}</div>
    </div>
  </article>`;
}

function renderCatalog() {
  const query = search.value.trim().toLowerCase();
  const results = cards.filter(card => {
    const text = `${card.name} ${card.description} ${rarityLabels[card.rarity]} ${card.id} Scarlet & Violet 151`.toLowerCase();
    return (selectedRarity === 'all' || selectedRarity === card.rarity) && text.includes(query);
  });
  if (sort.value === 'low') results.sort((a, b) => a.price - b.price);
  if (sort.value === 'high') results.sort((a, b) => b.price - a.price);
  grid.innerHTML = results.map(productTile).join('');
  document.querySelector('#result-count').textContent = `${results.length} ${results.length === 1 ? 'card' : 'cards'}`;
  document.querySelector('#empty-catalog').hidden = results.length !== 0;
}

function selectRarity(rarity) {
  selectedRarity = rarity;
  filters.forEach(button => button.setAttribute('aria-pressed', button.dataset.rarity === rarity));
  renderCatalog();
}

function openDetails(card) {
  detailFeedback.textContent = '';
  productDetail.innerHTML = `<article class="detail" style="--card-tone: ${card.tone}">
    <div class="detail-art">${cardImage(card, { alt: 'Placeholder card artwork' })}</div>
    <div>
      <p class="card-id">SCARLET &amp; VIOLET 151 · #${card.id}</p>
      <h2 id="detail-title">${card.name}</h2>
      <p class="detail-description">${rarityLabels[card.rarity]} · Near mint · English</p>
      <p class="detail-description">${card.description}</p>
      ${stockLabel(card)}
      <p class="price">${money(card.price)}</p>
      ${addButton(card)}
    </div>
  </article>`;
  productDialog.showModal();
}

function cartRow(card, quantity) {
  return `<article class="cart-row">
    ${cardImage(card)}
    <div>
      <h3>${card.name}</h3><p>${money(card.price)} each</p>
      <div class="cart-controls">
        <button type="button" data-change="-1" data-id="${card.id}" aria-label="Decrease ${card.name} quantity">−</button>
        <span aria-label="Quantity ${quantity}">${quantity}</span>
        <button type="button" data-change="1" data-id="${card.id}" aria-label="Increase ${card.name} quantity" ${quantity >= card.stock ? 'disabled' : ''}>+</button>
        <button type="button" data-change="-${quantity}" data-id="${card.id}" data-remove aria-label="Remove ${card.name}">Remove</button>
      </div>
    </div>
    <strong>${money(card.price * quantity)}</strong>
  </article>`;
}

function renderBag() {
  let itemCount = 0;
  let subtotal = 0;
  const rows = [];
  for (const [id, quantity] of bag) {
    const card = catalog.get(id);
    itemCount += quantity;
    subtotal += card.price * quantity;
    rows.push(cartRow(card, quantity));
  }
  document.querySelector('#cart-count').textContent = itemCount;
  document.querySelector('#subtotal').textContent = money(subtotal);
  cartItems.innerHTML = rows.join('') || '<div class="empty"><h3>Your bag is empty</h3><p>Browse the catalog to add a card.</p></div>';
  cartSummary.hidden = itemCount === 0;

  document.querySelectorAll('[data-add]').forEach(button => {
    const card = catalog.get(Number(button.dataset.add));
    const label = addLabel(card);
    button.textContent = label;
    button.setAttribute('aria-label', `${label}: ${card.name}`);
    button.disabled = label !== 'Add to bag';
  });
}

function changeQuantity(card, delta) {
  const quantity = (bag.get(card.id) ?? 0) + delta;
  if (quantity > card.stock || quantity < 0) return;
  if (quantity === 0) bag.delete(card.id);
  else bag.set(card.id, quantity);
  saveBag();
  renderBag();
}

// checkout.html reads the bag from localStorage
function saveBag() {
  try {
    localStorage.setItem('peko-bag', JSON.stringify([...bag]));
  } catch {
    // the bag still works in memory
  }
}

function addCard(card) {
  changeQuantity(card, 1);
  const message = `${card.name} added to your bag.`;
  if (productDialog.open) {
    detailFeedback.textContent = message;
    return;
  }
  announcement.textContent = '';
  announcement.textContent = message;
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(() => { announcement.textContent = ''; }, 3000);
}

filters.forEach(button => button.addEventListener('click', () => selectRarity(button.dataset.rarity)));
search.addEventListener('input', renderCatalog);
sort.addEventListener('change', renderCatalog);
document.querySelector('#reset-filters').addEventListener('click', () => {
  search.value = '';
  selectRarity('all');
  search.focus();
});

grid.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.details) openDetails(catalog.get(Number(button.dataset.details)));
  if (button?.dataset.add) addCard(catalog.get(Number(button.dataset.add)));
});

productDetail.addEventListener('click', event => {
  const button = event.target.closest('[data-add]');
  if (button) addCard(catalog.get(Number(button.dataset.add)));
});

document.querySelector('#open-cart').addEventListener('click', () => cartDialog.showModal());
cartItems.addEventListener('click', event => {
  const button = event.target.closest('[data-change]');
  if (!button) return;
  const { id, change } = button.dataset;
  changeQuantity(catalog.get(Number(id)), Number(change));
  const controls = [...cartItems.querySelectorAll(`[data-id="${id}"]:enabled`)];
  const next = controls.find(control => control.dataset.change === change && !control.hasAttribute('data-remove'));
  (next ?? controls[0] ?? cartDialog.querySelector('.close')).focus();
});

// bring the bag back from the last visit, skip cards that were deleted or sold out since then
try {
  const savedBag = JSON.parse(localStorage.getItem('peko-bag')) ?? [];
  for (const [id, quantity] of savedBag) {
    const card = catalog.get(id);
    if (card && card.stock > 0 && quantity > 0) bag.set(id, Math.min(quantity, card.stock));
  }
  saveBag();
} catch {
  // start with an empty bag
}

renderCatalog();
renderBag();
