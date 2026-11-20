import { rarityLabels } from '../data/cards.js';
import { money } from '../state/cart.js';
import { useShop } from '../state/ShopContext.jsx';
import { Modal } from './Modal.jsx';
import { AddToBagButton, CardImage, Stock } from './ProductCard.jsx';

export function ProductDialog({ card, onClose }) {
  const { message } = useShop();
  return <Modal open={Boolean(card)} onClose={onClose} titleId="detail-title" className="product-dialog">
    <button className="close" type="button" onClick={onClose} aria-label="Close card details">×</button>
    {card && <article className="detail" style={{ '--card-tone': card.tone }}>
      <div className="detail-art"><CardImage card={card} alt="Placeholder card artwork" /></div>
      <div>
        <p className="card-id">Scarlet &amp; Violet 151 · #{card.id}</p>
        <h2 id="detail-title">{card.name}</h2>
        <p className="detail-description">{rarityLabels[card.rarity]} · Near mint · English</p>
        <p className="detail-description">{card.description}</p>
        <Stock card={card} /><p className="price">{money(card.price)}</p>
        <AddToBagButton card={card} />
      </div>
    </article>}
    <p className="detail-feedback" role="status">{message}</p>
  </Modal>;
}
