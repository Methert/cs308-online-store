import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { money } from '../state/cart.js';
import { filterOrders, formatDate, ordersFor, readOrders, sortOrders, statusLabels, stepIndex, steps } from '../state/orders.js';
import { useShop } from '../state/ShopContext.jsx';
import './pages.css';

const statusFilters = ['all', 'processing', 'in_transit', 'delivered', 'cancelled'];

function OrderCard({ order, isNew }) {
  const current = stepIndex(order.status);
  return <article className={isNew ? 'order-card new-order' : 'order-card'} aria-labelledby={`order-${order.id}`}>
    <div className="order-top">
      <div>
        <h2 id={`order-${order.id}`}>Order #{order.id}</h2>
        <p className="order-date">Placed on {formatDate(order.date)}{isNew && ' · Just placed'}</p>
      </div>
      <span className={`status ${order.status}`}>{statusLabels[order.status]}</span>
    </div>
    {order.status === 'cancelled'
      ? <p className="cancelled-note">This order was cancelled.</p>
      : <ol className="order-steps" aria-label={`Order #${order.id} progress`}>
        {steps.map((step, index) => <li key={step} className={index <= current ? 'done' : ''} aria-current={index === current ? 'step' : undefined}>
          {statusLabels[step]}
        </li>)}
      </ol>}
    <ul className="order-items">
      {order.items.map(item => <li key={item.id}>
        <span>{item.name} × {item.quantity}</span><span>{money(item.price * item.quantity)}</span>
      </li>)}
    </ul>
    <div className="order-bottom">
      <span>Deliver to {order.address} · Card ending in {order.cardLast4}</span>
      <strong>{money(order.total)}</strong>
    </div>
  </article>;
}

export function OrdersPage() {
  const { user } = useShop();
  const location = useLocation();
  const [status, setStatus] = useState('all');
  // the checkout page sends the new order id so we can mark it
  const newOrderId = location.state?.newOrderId;

  if (!user) {
    return <section className="page" aria-labelledby="orders-title">
      <Link className="back-link" to="/">← Back to shop</Link>
      <h1 id="orders-title">My orders</h1>
      <div className="empty sign-in-needed">
        <h2>Sign in to see your orders</h2>
        <p>Your order history is kept with your account.</p>
        <Link className="add" to="/sign-in">Sign in</Link>
      </div>
    </section>;
  }

  const myOrders = sortOrders(ordersFor(readOrders(), user.id));
  const shown = filterOrders(myOrders, status);

  let list;
  if (myOrders.length === 0) {
    list = <div className="empty">
      <h2>No orders yet</h2><p>Orders you place at checkout will show up here.</p>
      <Link className="secondary" to="/">Browse cards</Link>
    </div>;
  } else if (shown.length === 0) {
    list = <div className="empty">
      <h2>No {statusLabels[status].toLowerCase()} orders</h2><p>Try another status.</p>
      <button className="secondary" type="button" onClick={() => setStatus('all')}>Show all orders</button>
    </div>;
  } else {
    list = <div className="order-list">
      {shown.map(order => <OrderCard key={order.id} order={order} isNew={order.id === newOrderId} />)}
    </div>;
  }

  return <section className="page" aria-labelledby="orders-title">
    <Link className="back-link" to="/">← Back to shop</Link>
    <div className="catalog-heading">
      <div><h1 id="orders-title">My orders</h1><p>Track your orders from processing to delivery.</p></div>
    </div>
    <div className="page-tools">
      <div className="filters" role="group" aria-label="Order status">
        {statusFilters.map(value => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>
          {value === 'all' ? 'All' : statusLabels[value]}
        </button>)}
      </div>
    </div>
    <p className="result-count" role="status">{shown.length} {shown.length === 1 ? 'order' : 'orders'}</p>
    {list}
  </section>;
}
