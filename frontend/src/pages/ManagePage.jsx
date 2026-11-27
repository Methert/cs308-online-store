import { useState } from 'react';
import { Link } from 'react-router';
import { ProductForm } from '../components/ProductForm.jsx';
import { money } from '../state/cart.js';
import {
  addProduct, conditionLabels, deleteProduct, LOW_STOCK, readInventory, saveInventory,
  stockStatus, stockSummary, updateProduct, updateStock,
} from '../state/inventory.js';
import './pages.css';
import { useShop } from '../state/ShopContext.jsx';
import { Loading } from '../components/RequestState.jsx';

const statusClass = { 'In stock': 'ok', 'Low stock': 'low', 'Out of stock': 'out' };

// Staff screen for products (Req. 12) and stock.
export function ManagePage() {
  const { user, authStatus } = useShop();
  const [products, setProducts] = useState(readInventory);
  const [tab, setTab] = useState('products');
  // null = form closed, 'new' = adding, a product = editing that product
  const [editing, setEditing] = useState(null);
  const [onlyLow, setOnlyLow] = useState(false);
  // stock inputs that were changed but not saved yet, by product id
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function save(nextProducts, text) {
    // TODO: send the change to the products API instead of localStorage
    setProducts(nextProducts);
    setError(saveInventory(nextProducts) ? '' : 'Your browser could not save the change. It will be lost after a refresh.');
    setMessage(text);
  }

  function saveProduct(values) {
    if (editing === 'new') save(addProduct(products, values), `${values.name.trim()} was added.`);
    else save(updateProduct(products, editing.id, values), `${values.name.trim()} was saved.`);
    setEditing(null);
  }

  function removeProduct(product) {
    if (!window.confirm(`Delete ${product.name}? This can not be undone.`)) return;
    save(deleteProduct(products, product.id), `${product.name} was deleted.`);
  }

  function saveStock(event, product) {
    event.preventDefault();
    const value = drafts[product.id] ?? String(product.stock);
    const result = updateStock(products, product.id, value);
    if (result.error) {
      setError(`${product.name}: ${result.error}`);
      setMessage('');
      return;
    }
    save(result.products, `${product.name} now has ${Number(value)} in stock.`);
    const nextDrafts = { ...drafts };
    delete nextDrafts[product.id];
    setDrafts(nextDrafts);
  }

  const summary = stockSummary(products);
  const stockRows = onlyLow ? products.filter(product => product.stock <= LOW_STOCK) : products;

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
        <p>Inventory preview. Changes here are saved in this browser and do not update the shop server.</p>
      </div>
    </div>
    <div className="filters tabs" role="group" aria-label="Management section">
      <button type="button" aria-pressed={tab === 'products'} onClick={() => setTab('products')}>Products</button>
      <button type="button" aria-pressed={tab === 'stock'} onClick={() => setTab('stock')}>Stock</button>
    </div>
    <p className="save-message" role="status">{message}</p>
    {error && <p className="account-error" role="alert">{error}</p>}

    {tab === 'products' && <>
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
              {products.map(product => <tr key={product.id}>
                <th scope="row">{product.name}</th>
                <td>{product.model}</td>
                <td>{product.serial}</td>
                <td>{conditionLabels[product.condition]}</td>
                <td className="number">{money(product.price)}</td>
                <td className="number">{product.stock}</td>
                <td><div className="row-actions">
                  <button className="small-button" type="button" onClick={() => setEditing(product)} aria-label={`Edit ${product.name}`}>Edit</button>
                  <button className="small-button danger" type="button" onClick={() => removeProduct(product)} aria-label={`Delete ${product.name}`}>Delete</button>
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>}
    </>}

    {tab === 'stock' && <>
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
      products={products} onSave={saveProduct} onClose={() => setEditing(null)} />}
  </section>;
}
