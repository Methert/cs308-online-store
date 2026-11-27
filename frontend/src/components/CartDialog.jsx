import { useRef } from 'react';
import { Link } from 'react-router';
import { money } from '../state/cart.js';
import { findCard } from '../state/catalog.js';
import { useShop } from '../state/ShopContext.jsx';
import { CardImage } from './ProductCard.jsx';
import { Modal } from './Modal.jsx';
import { Loading, RequestError } from './RequestState.jsx';
import { BagStatus } from './BagStatus.jsx';

export function CartDialog({ open, onClose }) {
  const { cart, cents, updateQuantity, cartStatus, cartBusy, mergePending, authStatus, sessionError, retrySession } = useShop();
  const busy = cartBusy || cartStatus !== 'ready' || mergePending || authStatus !== 'ready';
  const closeButton = useRef(null);
  async function changeItem(item, delta) {
    const saved = await updateQuantity(item.id, delta);
    if (saved && item.quantity + delta === 0) closeButton.current?.focus();
  }
  return <Modal open={open} onClose={onClose} titleId="cart-title" className="cart-dialog">
    <div className="cart-header">
      <h2 id="cart-title">Your bag</h2>
      <button className="close" ref={closeButton} type="button" onClick={onClose} aria-label="Close bag">×</button>
    </div>
    {authStatus === 'loading' && <Loading>Checking your account...</Loading>}
    {authStatus === 'error' && <RequestError message={sessionError} onRetry={retrySession} retryLabel="Retry account" />}
    {cartStatus === 'loading' && authStatus === 'ready' && <Loading>Loading your bag...</Loading>}
    <BagStatus />
    <div className="cart-items">
      {cart.length ? cart.map(item => {
        const card = item.card ?? findCard(item.id);
        if (!card) return null;
        return <article className="cart-row" key={item.id}>
          <CardImage card={card} />
          <div>
            <h3>{card.name}</h3><p>{money(card.price)} each</p>
            <div className="cart-controls">
              <button type="button" disabled={busy || item.quantity - 1 > Math.min(card.stock, 99)} onClick={() => changeItem(item, -1)} aria-label={`Decrease ${card.name} quantity`}>−</button>
              <span aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
              <button type="button" onClick={() => changeItem(item, 1)} disabled={busy || item.quantity >= card.stock || item.quantity >= 99} aria-label={`Increase ${card.name} quantity`}>+</button>
              <button type="button" disabled={busy} onClick={() => changeItem(item, -item.quantity)} aria-label={`Remove ${card.name}`}>Remove</button>
            </div>
            {item.quantity > card.stock && <p className="account-error">Only {card.stock} available. Reduce this quantity before checkout.</p>}
            {item.quantity > 99 && <p className="account-error">The limit is 99 copies per card.</p>}
            {item.quantity > Math.min(card.stock, 99) && Math.min(card.stock, 99) > 0 && <button className="small-button" type="button" disabled={busy}
              onClick={() => changeItem(item, Math.min(card.stock, 99) - item.quantity)}>Reduce to {Math.min(card.stock, 99)}</button>}
          </div>
          <strong>{money(card.price * item.quantity)}</strong>
        </article>;
      }) : cartStatus === 'ready' && <div className="empty"><h3>Your bag is empty</h3><p>Browse the catalog to add a card.</p></div>}
    </div>
    {cart.length > 0 && <div className="cart-summary">
      <div><strong>Subtotal</strong><strong>{money(cents)}</strong></div>
      {!busy && !cart.some(item => item.quantity > Math.min(item.card.stock, 99))
        ? <Link className="add checkout-link" to="/checkout" onClick={onClose}>Go to checkout</Link>
        : <p className="field-help">Finish updating your bag before checkout.</p>}
    </div>}
  </Modal>;
}
