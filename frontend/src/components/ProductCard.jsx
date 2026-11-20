import { rarityLabels } from '../data/cards.js';
import { money } from '../state/cart.js';
import { useShop } from '../state/ShopContext.jsx';

export function CardImage({ card, alt = '', loading = 'eager' }) {
  return <img src="/assets/card-preview.svg" alt={alt} width="245" height="342"
    loading={loading} style={{ backgroundColor: card.tone }} />;
}

export function AddToBagButton({ card }) {
  const { cart, updateQuantity, setMessage } = useShop();
  const quantity = cart.find(item => item.id === card.id)?.quantity ?? 0;
  const label = !card.stock ? 'Sold out' : quantity >= card.stock ? 'All in bag' : 'Add to bag';
  return <button className="add" type="button" disabled={quantity >= card.stock}
    aria-label={`${label}: ${card.name}`}
    onClick={() => { updateQuantity(card.id, 1); setMessage(`${card.name} added to your bag.`); }}>
    {label}
  </button>;
}

export function Stock({ card }) {
  return <p className={card.stock ? 'stock' : 'stock sold'}>{card.stock ? `${card.stock} in stock` : 'Out of stock'}</p>;
}

export function ProductCard({ card, onDetails }) {
  return <article className="product" style={{ '--card-tone': card.tone }}>
    <button className="product-art" type="button" onClick={() => onDetails(card)} aria-label={`View ${card.name} details`}>
      <span className="rarity">{rarityLabels[card.rarity]}</span>
      <CardImage card={card} loading="lazy" />
    </button>
    <div className="product-info">
      <p className="card-id">Scarlet &amp; Violet 151 · #{card.id}</p>
      <h3 className="card-title">{card.name}</h3>
      <Stock card={card} />
      <div className="product-bottom"><p className="price">{money(card.price)}</p><AddToBagButton card={card} /></div>
    </div>
  </article>;
}
