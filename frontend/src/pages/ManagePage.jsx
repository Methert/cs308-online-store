import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ProductForm } from '../components/ProductForm.jsx';
import { money } from '../state/cart.js';
import { loadCatalog } from '../state/catalog.js';
import { conditionLabels, isWholeNumber, LOW_STOCK, stockStatus, stockSummary } from '../state/inventory.js';
import { fromServerProduct, toServerProduct } from '../state/products-api.js';
import './pages.css';
import { useShop } from '../state/ShopContext.jsx';
import { Loading, RequestError } from '../components/RequestState.jsx';

const statusClass = { 'In stock': 'ok', 'Low stock': 'low', 'Out of stock': 'out' };

// every product, also the ones that were taken off sale (100 per page is the API limit)
async function loadProducts(authorizedRequest, signal) {
  const products = [];
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const data = await authorizedRequest(`/products/manage?status=all&limit=100&page=${page}`, { signal });
    products.push(...data.products);
    totalPages = data.pagination?.totalPages ?? 1;
  }
  return products.map(fromServerProduct);
}

// Staff screen for products (Req. 12) and stock, saved through the products API.
export function ManagePage() {
  const { user, authStatus, authorizedRequest } = useShop();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [resource, setResource] = useState({ status: 'loading', error: '' });
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState('products');
  // null = form closed, 'new' = adding, a product = editing that product
  const [editing, setEditing] = useState(null);
  const [onlyLow, setOnlyLow] = useState(false);
  // stock inputs that were changed but not saved yet, by product id
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isManager = user?.role === 'product_manager';

  useEffect(() => {
    if (!isManager || authStatus !== 'ready') return;
    const controller = new AbortController();
    setResource({ status: 'loading', error: '' });
    Promise.all([
      loadProducts(authorizedRequest, controller.signal),
      authorizedRequest('/categories', { signal: controller.signal }),
    ])
      .then(([list, categoryData]) => {
        if (controller.signal.aborted) return;
        setProducts(list);
        setCategories(categoryData.categories);
        setResource({ status: 'ready', error: '' });
      })
      .catch(err => { if (!controller.signal.aborted) setResource({ status: 'error', error: err.message }); });
    return () => controller.abort();
  }, [isManager, user?.id, authStatus, authorizedRequest, reload]);

  // put the product the server sent back into the list (or add it when it is new)
  function showSaved(saved, text) {
    const product = fromServerProduct(saved);
    setProducts(current => (current.some(item => item.id === product.id)
      ? current.map(item => (item.id === product.id ? product : item))
      : [...current, product]));
    setError('');
    setMessage(text);
    // the shop page shows the same products, so load them again
    loadCatalog();
  }

  // ProductForm waits for this, if it throws the form shows the error
  async function saveProduct(values) {
    if (editing === 'new') {
      const data = await authorizedRequest('/products', {
        method: 'POST', body: { ...toServerProduct(values), stockQuantity: Number(values.stock) },
      });
      showSaved(data.product, `${data.product.name} was added.`);
    } else {
      let data = await authorizedRequest(`/products/${editing.id}`, { method: 'PATCH', body: toServerProduct(values) });
      // the stock has its own request
      if (Number(values.stock) !== editing.stock) {
        data = await authorizedRequest(`/products/${editing.id}/stock`, { method: 'PATCH', body: { stockQuantity: Number(values.stock) } });
      }
      showSaved(data.product, `${data.product.name} was saved.`);
    }
    setEditing(null);
  }

  // DELETE does not remove the row, it takes the product off sale (old orders still use it)
  async function removeProduct(product) {
    if (!window.confirm(`Take ${product.name} off sale? Customers will not see it in the shop.`)) return;
    try {
      const data = await authorizedRequest(`/products/${product.id}`, { method: 'DELETE' });
      showSaved(data.product, `${product.name} was taken off sale.`);
    } catch (err) {
      setError(`${product.name}: ${err.message}`);
      setMessage('');
    }
  }

  async function restoreProduct(product) {
    try {
      const data = await authorizedRequest(`/products/${product.id}`, { method: 'PATCH', body: { isActive: true } });
      showSaved(data.product, `${product.name} is on sale again.`);
    } catch (err) {
      setError(`${product.name}: ${err.message}`);
      setMessage('');
    }
  }

  async function saveStock(event, product) {
    event.preventDefault();
    const value = drafts[product.id] ?? String(product.stock);
    if (!isWholeNumber(value)) {
      setError(`${product.name}: Stock must be a whole number (0 or more).`);
      setMessage('');
      return;
    }
    try {
      const data = await authorizedRequest(`/products/${product.id}/stock`, { method: 'PATCH', body: { stockQuantity: Number(value) } });
      showSaved(data.product, `${product.name} now has ${data.product.stockQuantity} in stock.`);
      setDrafts(current => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
    } catch (err) {
      setError(`${product.name}: ${err.message}`);
      setMessage('');
    }
  }

  // products that are off sale are not counted in the stock tab
  const onSale = products.filter(product => product.isActive);
  const summary = stockSummary(onSale);
  const stockRows = onlyLow ? onSale.filter(product => product.stock <= LOW_STOCK) : onSale;

  if (authStatus === 'loading') return <Loading>Checking staff access...</Loading>;
  if (!user || user.role !== 'product_manager') return <section className="page empty">
    <h1>Product manager access required</h1><p>Sign in with a product manager account to open this page.</p>
    {!user && <Link className="secondary" to="/sign-in" state={{ from: '/manage' }}>Sign in</Link>}
  </section>;

  return <section className="page" aria-labelledby="manage-title">
    <Link className="back-link" to="/">← Back to shop</Link>
    <div className="catalog-heading">
      <div>
        <h1 id="manage-title">Manage products</h1>
        <p>Add products, change their details and keep the stock up to date.</p>
      </div>
      <Link className="secondary" to="/deliveries">Delivery list</Link>
    </div>
    <div className="filters tabs" role="group" aria-label="Management section">
      <button type="button" aria-pressed={tab === 'products'} onClick={() => setTab('products')}>Products</button>
      <button type="button" aria-pressed={tab === 'stock'} onClick={() => setTab('stock')}>Stock</button>
    </div>
    <p className="save-message" role="status">{message}</p>
    {error && <p className="account-error" role="alert">{error}</p>}

    {resource.status === 'loading' && <Loading>Loading products...</Loading>}
    {resource.status === 'error' && <RequestError message={`Products could not be loaded. ${resource.error}`} onRetry={() => setReload(value => value + 1)} />}

    {resource.status === 'ready' && tab === 'products' && <>
      <div className="toolbar">
        <h2>Products</h2>
        <button className="add" type="button" onClick={() => setEditing('new')}>Add product</button>
      </div>
      {products.length === 0 ? <div className="empty"><h2>No products</h2><p>Add the first product to the store.</p></div>
        : <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th scope="col">Name</th><th scope="col">Model</th><th scope="col">Serial number</th><th scope="col">Condition</th>
              <th scope="col" className="number">Price</th><th scope="col" className="number">Stock</th><th scope="col">Actions</th>
            </tr></thead>
            <tbody>
              {products.map(product => <tr key={product.id} className={product.isActive ? '' : 'off-sale'}>
                <th scope="row">{product.isActive ? product.name : <>{product.name} <span className="off-sale-label">(off sale)</span></>}</th>
                <td>{product.model}</td>
                <td>{product.serial}</td>
                <td>{conditionLabels[product.condition]}</td>
                <td className="number">{money(product.price)}</td>
                <td className="number">{product.stock}</td>
                <td><div className="row-actions">
                  <button className="small-button" type="button" onClick={() => setEditing(product)} aria-label={`Edit ${product.name}`}>Edit</button>
                  {product.isActive
                    ? <button className="small-button danger" type="button" onClick={() => removeProduct(product)} aria-label={`Remove ${product.name}`}>Remove</button>
                    : <button className="small-button" type="button" onClick={() => restoreProduct(product)} aria-label={`Put ${product.name} back on sale`}>Restore</button>}
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </>}

    {resource.status === 'ready' && tab === 'stock' && <>
      <div className="stats">
        <div className="stat"><p>Products</p><strong>{summary.products}</strong></div>
        <div className="stat"><p>Cards in stock</p><strong>{summary.units}</strong></div>
        <div className="stat"><p>Low stock</p><strong>{summary.low}</strong></div>
        <div className="stat"><p>Out of stock</p><strong>{summary.out}</strong></div>
      </div>
      <div className="toolbar">
        <h2>Stock</h2>
        <label className="check">
          <input type="checkbox" checked={onlyLow} onChange={event => setOnlyLow(event.target.checked)} />
          Show only low or out of stock
        </label>
      </div>
      {stockRows.length === 0 ? <div className="empty"><h2>Nothing is running low</h2><p>Every product has more than {LOW_STOCK} cards.</p></div>
        : <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th scope="col">Name</th><th scope="col">Serial number</th><th scope="col">Status</th><th scope="col">Quantity</th>
            </tr></thead>
            <tbody>
              {stockRows.map(product => {
                const status = stockStatus(product.stock);
                return <tr key={product.id}>
                  <th scope="row">{product.name}</th>
                  <td>{product.serial}</td>
                  <td><span className={`stock-label ${statusClass[status]}`}>{status}</span> ({product.stock})</td>
                  <td>
                    <form className="row-actions" onSubmit={event => saveStock(event, product)}>
                      <input className="stock-input" type="number" min="0" step="1" aria-label={`Stock for ${product.name}`}
                        value={drafts[product.id] ?? String(product.stock)}
                        onChange={event => setDrafts({ ...drafts, [product.id]: event.target.value })} />
                      <button className="small-button" type="submit" aria-label={`Save stock for ${product.name}`}>Save</button>
                    </form>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
    </>}

    {editing && <ProductForm key={editing === 'new' ? 'new' : editing.id} product={editing === 'new' ? null : editing}
      products={products} categories={categories} onSave={saveProduct} onClose={() => setEditing(null)} />}
  </section>;
}
