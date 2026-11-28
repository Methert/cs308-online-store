import { ProductCard } from '../components/ProductCard.jsx';
import { loadCatalog, rarityLabel, useCatalog } from '../state/catalog.js';
import { Loading, RequestError } from '../components/RequestState.jsx';

export function CatalogPage({ filters, onFilters, onDetails }) {
  const { cards, source, error } = useCatalog();
  // One filter button per rarity the shop actually has, in the order the cards come.
  const rarities = new Map(cards.map(card => [card.rarity, rarityLabel(card)]));
  const query = filters.query.trim().toLowerCase();
  const results = cards.filter(card => {
    const match = card.name.toLowerCase().includes(query)
      || (filters.descriptions && card.description.toLowerCase().includes(query));
    return match && (filters.rarity === 'all' || filters.rarity === card.rarity);
  });
  if (filters.sort === 'popular') results.sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0));
  if (filters.sort === 'low') results.sort((a, b) => a.price - b.price);
  if (filters.sort === 'high') results.sort((a, b) => b.price - a.price);

  return <section id="catalog" className="catalog" aria-labelledby="catalog-title">
    <div className="catalog-heading">
      <div><h1 id="catalog-title">Shop singles</h1><p>Browse Pokémon trading cards.</p></div>
      <div className="search-controls">
        <label className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input type="search" placeholder="Search card names..." aria-label="Search cards"
            value={filters.query} onChange={event => onFilters({ query: event.target.value })} />
        </label>
        <label className="description-search">
          <input type="checkbox" checked={filters.descriptions} onChange={event => onFilters({ descriptions: event.target.checked })} />
          Include descriptions
        </label>
      </div>
    </div>
    <div className="catalog-tools">
      <div className="filters" role="group" aria-label="Card rarity">
        {[['all', 'All cards'], ...rarities].map(([rarity, label]) =>
          <button type="button" key={rarity} aria-pressed={filters.rarity === rarity} onClick={() => onFilters({ rarity })}>{label}</button>)}
      </div>
      <label className="sort">Sort by
        <select aria-label="Sort cards" value={filters.sort} onChange={event => onFilters({ sort: event.target.value })}>
          <option value="popular">Popularity</option>
          <option value="low">Price: low to high</option>
          <option value="high">Price: high to low</option>
        </select>
      </label>
    </div>
    {(source === 'idle' || source === 'loading') && <Loading>Loading cards...</Loading>}
    {source === 'error' && <RequestError message={`We could not load the shop. ${error}`} onRetry={() => loadCatalog()} />}
    {source === 'api' && <p className="result-count" role="status">{results.length} {results.length === 1 ? 'card' : 'cards'}</p>}
    <div className="product-grid">
      {results.map(card => <ProductCard key={card.id} card={card} onDetails={onDetails} />)}
    </div>
    {source === 'api' && !results.length && <div className="empty">
      <h3>{cards.length ? 'No cards found' : 'No cards available yet'}</h3>
      <p>{cards.length ? 'Try another search or clear the rarity filter.' : 'Please check back soon.'}</p>
      {cards.length > 0 && <button className="secondary" type="button" onClick={() => onFilters({ query: '', rarity: 'all', descriptions: false })}>Clear filters</button>}
    </div>}
  </section>;
}
