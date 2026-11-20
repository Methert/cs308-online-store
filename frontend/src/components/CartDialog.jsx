import { useRef } from 'react';
import { cards } from '../data/cards.js';
import { money } from '../state/cart.js';
import { useShop } from '../state/ShopContext.jsx';
import { CardImage } from './ProductCard.jsx';
import { Modal } from './Modal.jsx';

export function CartDialog({ open, onClose }) {
  const { cart, cents, updateQuantity, storageError } = useShop();
  const closeButton = useRef(null);
  function changeItem(item, delta) {
    updateQuantity(item.id, delta);
    if (item.quantity + delta === 0) closeButton.current?.focus();
  }
  return <Modal open={open} onClose={onClose} titleId="cart-title" className="cart-dialog">
    <div className="cart-header">
      <h2 id="cart-title">Your bag</h2>
      <button className="close" ref={closeButton} type="button" onClick={onClose} aria-label="Close bag">×</button>
    </div>
    <div className="cart-items">
      {cart.length ? cart.map(item => {
        const card = cards.find(card => card.id === item.id);
        return <article className="cart-row" key={item.id}>
          <CardImage card={card} />
          <div>
            <h3>{card.name}</h3><p>{money(card.price)} each</p>
            <div className="cart-controls">
              <button type="button" onClick={() => changeItem(item, -1)} aria-label={`Decrease ${card.name} quantity`}>−</button>
              <span aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
              <button type="button" onClick={() => changeItem(item, 1)} disabled={item.quantity >= card.stock} aria-label={`Increase ${card.name} quantity`}>+</button>
              <button type="button" onClick={() => changeItem(item, -item.quantity)} aria-label={`Remove ${card.name}`}>Remove</button>
            </div>
          </div>
          <strong>{money(card.price * item.quantity)}</strong>
        </article>;
      }) : <div className="empty"><h3>Your bag is empty</h3><p>Browse the catalog to add a card.</p></div>}
    </div>
    {storageError && <p className="cart-storage-status" role="status">Your browser could not save this bag. Keep this page open to retain your items.</p>}
    {cart.length > 0 && <div className="cart-summary">
      <div><strong>Subtotal</strong><strong>{money(cents)}</strong></div>
      <p>Demo bag. Checkout is unavailable in this prototype.</p>
    </div>}
  </Modal>;
}
