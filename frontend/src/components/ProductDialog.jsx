import { money } from '../state/cart.js';
import { rarityLabel } from '../state/catalog.js';
import { useShop } from '../state/ShopContext.jsx';
import { Modal } from './Modal.jsx';
import { AddToBagButton, CardImage, Stock, cardLabel } from './ProductCard.jsx';

export function ProductDialog({ card, onClose }) {
  const { message } = useShop();
  return <Modal open={Boolean(card)} onClose={onClose} titleId="detail-title" className="product-dialog">
    <button className="close" type="button" onClick={onClose} aria-label="Close card details">×</button>
    {card && <article className="detail" style={{ '--card-tone': card.tone }}>
      <div className="detail-art"><CardImage card={card} alt={card.imageUrl ? `${card.name} card` : 'Placeholder card artwork'} /></div>
      <div>
        <p className="card-id">{cardLabel(card)}</p>
        <h2 id="detail-title">{card.name}</h2>
        <p className="detail-description">{rarityLabel(card)} · {card.conditionLabel ?? 'Near mint'} · English</p>
        <p className="detail-description">{card.description}</p>
        <Stock card={card} /><p className="price">{money(card.price)}</p>
        <AddToBagButton card={card} />
      </div>
    </article>}
    <p className="detail-feedback" role="status">{message}</p>
  </Modal>;
}
