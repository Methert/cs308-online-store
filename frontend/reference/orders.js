'use strict';

// Order history page. checkout.js saves the orders in localStorage.
// TODO: load the signed-in customer's orders from GET /api/orders instead.

// the order moves through these steps, a cancelled order stops
const steps = ['processing', 'in_transit', 'delivered'];

const orderList = document.querySelector('#order-list');
const orderCount = document.querySelector('#order-count');
const emptyOrders = document.querySelector('#orders-empty');
const statusButtons = [...document.querySelectorAll('[data-status]')];

const orders = loadOrders();
let selectedStatus = 'all';

// checkout.html links here with #order-<id>, that order gets highlighted
const highlightId = Number(window.location.hash.replace('#order-', '')) || null;

// newest order first
function sortOrders(list) {
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function filterOrders(list, status) {
  if (status === 'all') return list;
  return list.filter(order => order.status === status);
}

// 0 = processing, 1 = in transit, 2 = delivered, -1 = cancelled
function stepIndex(status) {
  return steps.indexOf(status);
}

function orderSteps(order) {
  if (order.status === 'cancelled') {
    return '<p class="cancelled-note">This order was cancelled.</p>';
  }
  const current = stepIndex(order.status);
  const items = steps.map((step, index) => `<li class="${index <= current ? 'done' : ''}">${statusLabels[step]}</li>`);
  return `<ol class="order-steps" aria-label="Delivery progress">${items.join('')}</ol>`;
}

function orderCard(order) {
  let cardCount = 0;
  for (const item of order.items) cardCount += item.quantity;
  const rows = order.items.map(item => `<li>
      <span>${escapeHtml(item.name)} × ${item.quantity}</span>
      <span>${money(item.price * item.quantity)}</span>
    </li>`);
  return `<article class="order-card${order.id === highlightId ? ' new-order' : ''}" id="order-${order.id}">
    <div class="order-top">
      <div>
        <h2>Order #${order.id}</h2>
        <p class="order-date">Placed on ${formatDate(order.date)} · ${cardCount} ${cardCount === 1 ? 'card' : 'cards'}</p>
      </div>
      <span class="status ${order.status}">${statusLabels[order.status]}</span>
    </div>
    ${orderSteps(order)}
    <ul class="order-items">${rows.join('')}</ul>
    <div class="order-bottom">
      <span>Deliver to ${escapeHtml(order.address)} · Card ending in ${order.cardLast4}</span>
      <span>Total <strong>${money(order.total)}</strong></span>
    </div>
  </article>`;
}

function renderOrders() {
  const shown = filterOrders(sortOrders(orders), selectedStatus);
  orderList.innerHTML = shown.map(orderCard).join('');
  orderCount.textContent = `${shown.length} ${shown.length === 1 ? 'order' : 'orders'}`;
  emptyOrders.hidden = shown.length !== 0;
}

function selectStatus(status) {
  selectedStatus = status;
  statusButtons.forEach(button => button.setAttribute('aria-pressed', button.dataset.status === status));
  renderOrders();
}

statusButtons.forEach(button => button.addEventListener('click', () => selectStatus(button.dataset.status)));

renderOrders();
if (highlightId) {
  const newOrder = document.querySelector('#order-' + highlightId);
  if (newOrder) newOrder.scrollIntoView({ block: 'center' });
}
