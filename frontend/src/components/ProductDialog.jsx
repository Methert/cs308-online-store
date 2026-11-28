import { useEffect, useState } from 'react';
import { money } from '../state/cart.js';
import { rarityLabel, toCard } from '../state/catalog.js';
import { request } from '../state/api.js';
import { useShop } from '../state/ShopContext.jsx';
import { Modal } from './Modal.jsx';
import { ProductReviews } from './ProductReviews.jsx';
import { Loading, RequestError } from './RequestState.jsx';
import { AddToBagButton, CardImage, Stock, cardLabel } from './ProductCard.jsx';
import { BagStatus } from './BagStatus.jsx';

function ProductDetails({ selected, onClose }) {
  const [resource, setResource] = useState({ status: 'loading' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResource({ status: 'loading' });
    request(`/products/${selected.id}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResource({ status: 'ready', card: toCard(data.product) }); })
      .catch(error => { if (!controller.signal.aborted) setResource({ status: 'error', error: error.message, missing: error.status === 404 }); });
    return () => controller.abort();
  }, [selected.id, reload]);
  const card = resource.card ?? selected;
  return <>
    <h2 id="detail-title" className="detail-heading">{card.name}</h2>
    {resource.status === 'loading' && <Loading>Loading card details...</Loading>}
    {resource.status === 'error' && <RequestError message={resource.missing ? 'This card is no longer available.' : resource.error}
      onRetry={resource.missing ? undefined : () => setReload(value => value + 1)} />}
    {resource.status === 'ready' && <>
      <article className="detail" style={{ '--card-tone': card.tone }}>
        <div className="detail-art"><CardImage card={card} alt={card.imageUrl ? `${card.name} card` : 'Placeholder card artwork'} /></div>
        <div>
          <p className="card-id">{cardLabel(card)}</p>
          <p className="detail-description">{rarityLabel(card)} · {card.conditionLabel ?? 'Near mint'} · English</p>
          <p className="detail-description">{card.description}</p>
          <dl className="card-metadata">
            {[[card.serial, 'Serial number'], [card.warranty, 'Warranty'], [card.distributor, 'Distributor']].filter(([value]) => value).map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <Stock card={card} /><p className="price">{money(card.price)}</p>
          <AddToBagButton card={card} />
        </div>
      </article>
      <ProductReviews productId={card.id} onClose={onClose} />
    </>}
  </>;
}

export function ProductDialog({ card, onClose }) {
  const { message } = useShop();
  return <Modal open={Boolean(card)} onClose={onClose} titleId="detail-title" className="product-dialog">
    <button className="close" type="button" onClick={onClose} aria-label="Close card details">×</button>
    {card && <ProductDetails key={card.id} selected={card} onClose={onClose} />}
    <BagStatus />
    <p className="detail-feedback" role="status">{message}</p>
  </Modal>;
}
