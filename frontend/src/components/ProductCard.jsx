import { money } from '../state/cart.js';
import { rarityLabel, useCatalog } from '../state/catalog.js';
import { useShop } from '../state/ShopContext.jsx';

// The card's picture from the backend, or the placeholder for the sample cards.
export function CardImage({ card, alt = '', loading = 'eager' }) {
  return <img src={card.imageUrl ?? '/assets/card-preview.svg'} alt={alt} width="245" height="342"
    loading={loading} style={{ backgroundColor: card.tone }} />;
}

// "151 · #199/165" for API cards; the sample cards keep their original label.
export function cardLabel(card) {
  return card.setName ? `${card.setName} · #${card.number}` : `Scarlet & Violet 151 · #${card.id}`;
}

export function AddToBagButton({ card }) {
  const { cart, updateQuantity, authStatus, cartStatus, cartBusy, mergePending } = useShop();
  const { source } = useCatalog();
  const quantity = cart.find(item => item.id === card.id)?.quantity ?? 0;
  const label = !card.stock ? 'Sold out' : quantity >= card.stock ? 'All in bag' : 'Add to bag';
  return <button className="add" type="button" disabled={quantity >= card.stock || quantity >= 99 || source !== 'api' || authStatus !== 'ready' || cartStatus !== 'ready' || cartBusy || mergePending}
    aria-label={`${label}: ${card.name}`}
    onClick={() => updateQuantity(card.id, 1)}>
    {label}
  </button>;
}

export function Stock({ card }) {
  return <p className={card.stock ? 'stock' : 'stock sold'}>{card.stock ? `${card.stock} in stock` : 'Out of stock'}</p>;
}

export function ProductCard({ card, onDetails }) {
  return <article className="product" style={{ '--card-tone': card.tone }}>
    <button className="product-art" type="button" onClick={() => onDetails(card)} aria-label={`View ${card.name} details`}>
      <span className="rarity">{rarityLabel(card)}</span>
      <CardImage card={card} loading="lazy" />
    </button>
    <div className="product-info">
      <p className="card-id">{cardLabel(card)}{card.conditionLabel && ` · ${card.conditionLabel}`}</p>
      <h3 className="card-title">{card.name}</h3>
      <Stock card={card} />
      <div className="product-bottom"><p className="price">{money(card.price)}</p><AddToBagButton card={card} /></div>
    </div>
  </article>;
}
