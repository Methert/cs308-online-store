import { useState } from 'react';
import { fieldErrors } from '../state/api.js';
import { conditionLabels, emptyProduct, productToValues, validateProduct } from '../state/inventory.js';
import { Modal } from './Modal.jsx';

// Add or edit one product. product is null when adding a new one.
// onSave sends the product to the server, the form waits for it.
export function ProductForm({ product, products, categories, onSave, onClose }) {
  const [values, setValues] = useState(product ? productToValues(product) : emptyProduct);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  function updateValue(event) {
    setValues({ ...values, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const formErrors = validateProduct(values, products, product ? product.id : null);
    setErrors(formErrors);
    if (formErrors.length > 0) return;
    setSaving(true);
    try {
      await onSave(values);
    } catch (error) {
      // the server checks the product again, show what it did not accept
      const messages = Object.values(fieldErrors(error));
      setErrors(messages.length > 0 ? messages : [error.message]);
      setSaving(false);
    }
  }

  return <Modal open onClose={onClose} titleId="product-form-title" className="product-form-dialog">
    <button className="close" type="button" onClick={onClose} aria-label="Close product form">×</button>
    <h2 id="product-form-title">{product ? `Edit ${product.name}` : 'Add a product'}</h2>
    <form onSubmit={submit} noValidate>
      {errors.length > 0 && <ul className="form-errors" role="alert">
        {errors.map(error => <li key={error}>{error}</li>)}
      </ul>}
      <div className="form-grid">
        <div className="account-field">
          <label htmlFor="product-name">Name</label>
          <input id="product-name" name="name" value={values.name} onChange={updateValue} />
        </div>
        <div className="account-field">
          <label htmlFor="product-category">Category</label>
          <select id="product-category" name="categoryId" value={values.categoryId} onChange={updateValue}>
            <option value="">Choose a card set</option>
            {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="account-field">
          <label htmlFor="product-model">Model</label>
          <input id="product-model" name="model" placeholder="173/165" value={values.model} onChange={updateValue} />
        </div>
        <div className="account-field">
          <label htmlFor="product-serial">Serial number</label>
          <input id="product-serial" name="serial" placeholder="PC-151-173" value={values.serial} onChange={updateValue} />
        </div>
        <div className="account-field">
          <label htmlFor="product-condition">Condition</label>
          <select id="product-condition" name="condition" value={values.condition} onChange={updateValue}>
            {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="account-field">
          {/* the cards in the database have many rarities, so this is free text */}
          <label htmlFor="product-rarity">Rarity</label>
          <input id="product-rarity" name="rarity" placeholder="Illustration rare" value={values.rarity} onChange={updateValue} />
        </div>
        <div className="account-field">
          <label htmlFor="product-price">Price ($)</label>
          <input id="product-price" name="price" type="number" min="0" step="0.01" inputMode="decimal" value={values.price} onChange={updateValue} />
        </div>
        <div className="account-field">
          <label htmlFor="product-stock">Quantity in stock</label>
          <input id="product-stock" name="stock" type="number" min="0" step="1" inputMode="numeric" value={values.stock} onChange={updateValue} />
        </div>
        <div className="account-field">
          <label htmlFor="product-warranty">Warranty status</label>
          <input id="product-warranty" name="warranty" placeholder="30-day authenticity guarantee" value={values.warranty} onChange={updateValue} />
        </div>
        <div className="account-field">
          <label htmlFor="product-distributor">Distributor</label>
          <input id="product-distributor" name="distributor" value={values.distributor} onChange={updateValue} />
        </div>
        <div className="account-field wide">
          <label htmlFor="product-description">Description</label>
          <textarea id="product-description" name="description" value={values.description} onChange={updateValue} />
        </div>
      </div>
      <div className="form-actions">
        <button className="secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="add" type="submit" disabled={saving}>{product ? 'Save changes' : 'Add product'}</button>
      </div>
    </form>
  </Modal>;
}
