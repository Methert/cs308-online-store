import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CardImage } from '../components/ProductCard.jsx';
import { money } from '../state/cart.js';
import { catalogSource, findCard, getCards } from '../state/catalog.js';
import { bankDecision, checkStock, createOrder, emptyCheckout, formatCardNumber, formatExpiry, validateCheckout } from '../state/checkout.js';
import { lowerStock, readInventory, saveInventory } from '../state/inventory.js';
import { formatDate, readOrders, saveOrders } from '../state/orders.js';
import { useShop } from '../state/ShopContext.jsx';
import './pages.css';

// how long the fake bank "thinks" before answering
export const BANK_DELAY = 1500;

// used to focus the first wrong field
const fieldOrder = ['fullName', 'address', 'city', 'postalCode', 'cardName', 'cardNumber', 'expiry', 'cvv'];

function Field({ id, label, wide = false, error, ...inputProps }) {
  return <div className={wide ? 'account-field wide' : 'account-field'}>
    <label htmlFor={id}>{label}</label>
    <input id={id} name={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...inputProps} />
    {error && <p className="account-error" id={`${id}-error`}>{error}</p>}
  </div>;
}

export function CheckoutPage() {
  const { cart, cents, user, updateQuantity } = useShop();
  const [fields, setFields] = useState(emptyCheckout);
  const [errors, setErrors] = useState({});
  const [stockProblems, setStockProblems] = useState([]);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState(null);
  const [retry, setRetry] = useState(false);
  const resultHeading = useRef(null);
  const bankTimer = useRef(null);

  // stop the fake bank if the customer leaves the page while it is waiting
  useEffect(() => () => window.clearTimeout(bankTimer.current), []);

  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);

  // bag rows with the same name and price the shop shows
  const items = cart.filter(item => findCard(item.id)).map(item => {
    const card = findCard(item.id);
    return { id: card.id, name: card.name, price: card.price, quantity: item.quantity, card };
  });
  // Cards from the backend carry their own stock; the sample cards use the management page's
  // saved inventory.
  const fromApi = catalogSource() === 'api';

  function updateField(event) {
    const { name } = event.target;
    let value = event.target.value;
    if (name === 'cardNumber') value = formatCardNumber(value);
    if (name === 'expiry') value = formatExpiry(value);
    if (name === 'cvv') value = value.replace(/\D/g, '').slice(0, 3);
    setFields({ ...fields, [name]: value });
  }

  function pay(event) {
    event.preventDefault();
    const formErrors = validateCheckout(fields);
    setErrors(formErrors);
    const firstWrong = fieldOrder.find(name => formErrors[name]);
    if (firstWrong) {
      document.getElementById(firstWrong).focus();
      return;
    }

    // the stock may have changed on the management page, so check the saved inventory
    const problems = checkStock(items, fromApi ? getCards() : readInventory());
    setStockProblems(problems);
    if (problems.length > 0) return;

    // TODO: send the payment and the order to the backend instead of the fake bank
    setPaying(true);
    bankTimer.current = window.setTimeout(() => {
      const decision = bankDecision(fields.cardNumber);
      setPaying(false);
      if (!decision.approved) {
        setResult({ approved: false, message: decision.message });
        return;
      }
      const orders = readOrders();
      const order = createOrder({ items, fields, orders, user });
      saveOrders([...orders, order]);
      // TODO: with backend cards the stock only drops once orders go to POST /api/orders.
      if (!fromApi) saveInventory(lowerStock(readInventory(), items));
      // empty the bag
      for (const item of items) updateQuantity(item.id, -item.quantity);
      setResult({ approved: true, order });
    }, BANK_DELAY);
  }

  function tryAgain() {
    // new card details, the delivery address stays
    setFields({ ...fields, cardNumber: '', expiry: '', cvv: '' });
    setRetry(true);
    setResult(null);
  }

  if (result && result.approved) {
    const { order } = result;
    return <section className="page bank-result approved" aria-labelledby="result-title">
      <div className="result-icon" aria-hidden="true">✓</div>
      <h1 id="result-title" ref={resultHeading} tabIndex="-1">Payment approved</h1>
      <p>Thank you! Order #{order.id} is now processing.</p>
      <div className="panel receipt">
        <h2>Invoice</h2>
        {order.items.map(item => <div className="receipt-row" key={item.id}>
          <span>{item.name} × {item.quantity}</span><span>{money(item.price * item.quantity)}</span>
        </div>)}
        <div className="receipt-row total"><span>Total paid</span><span>{money(order.total)}</span></div>
        <p>Deliver to {order.customer}, {order.address}</p>
        <p>Paid on {formatDate(order.date)} with the card ending in {order.cardLast4}</p>
      </div>
      <div className="result-actions">
        <Link className="add" to="/orders" state={{ newOrderId: order.id }}>View my orders</Link>
        <Link className="secondary" to="/">Continue shopping</Link>
      </div>
    </section>;
  }

  if (result) {
    return <section className="page bank-result declined" aria-labelledby="result-title">
      <div className="result-icon" aria-hidden="true">✕</div>
      <h1 id="result-title" ref={resultHeading} tabIndex="-1">Payment declined</h1>
      <p>{result.message} Nothing was charged and your bag is still saved.</p>
      <div className="result-actions">
        <button className="add" type="button" onClick={tryAgain}>Try another card</button>
        <Link className="secondary" to="/">Back to shop</Link>
      </div>
    </section>;
  }

  let content;
  if (items.length === 0) {
    content = <div className="empty sign-in-needed">
      <h2>Your bag is empty</h2><p>Add a card from the shop before you check out.</p>
      <Link className="secondary" to="/">Browse cards</Link>
    </div>;
  } else if (!user) {
    // Req. 4: browsing works without an account, ordering needs one
    content = <div className="empty sign-in-needed">
      <h2>Sign in to place your order</h2>
      <p>Your bag is saved and will still be here after you sign in.</p>
      <div className="result-actions">
        <Link className="add" to="/sign-in">Sign in</Link>
        <Link className="secondary" to="/sign-up">Create an account</Link>
      </div>
    </div>;
  } else {
    content = <form className="checkout-layout" onSubmit={pay} noValidate>
      <div className="checkout-fields">
        <fieldset className="panel">
          <legend>Delivery</legend>
          <div className="form-grid">
            <Field id="fullName" label="Full name" wide autoComplete="name" value={fields.fullName} error={errors.fullName} onChange={updateField} />
            <Field id="address" label="Address" wide autoComplete="street-address" value={fields.address} error={errors.address} onChange={updateField} />
            <Field id="city" label="City" autoComplete="address-level2" value={fields.city} error={errors.city} onChange={updateField} />
            <Field id="postalCode" label="Postal code" autoComplete="postal-code" inputMode="numeric" maxLength="5" value={fields.postalCode} error={errors.postalCode} onChange={updateField} />
          </div>
        </fieldset>
        <fieldset className="panel">
          <legend>Payment</legend>
          <div className="test-cards">
            <strong>Test cards</strong> (mock bank, no real payment is made)
            <ul>
              <li><code>4242 4242 4242 4242</code> approved</li>
              <li><code>4000 0000 0000 0002</code> declined</li>
              <li><code>4000 0000 0000 9995</code> insufficient funds</li>
            </ul>
            <p>Use any future expiry date and any 3-digit CVV.</p>
          </div>
          <div className="form-grid">
            <Field id="cardName" label="Name on card" wide autoComplete="cc-name" value={fields.cardName} error={errors.cardName} onChange={updateField} />
            <Field id="cardNumber" label="Card number" wide className="card-input" autoComplete="cc-number" inputMode="numeric" maxLength="19"
              placeholder="1234 5678 9012 3456" autoFocus={retry} value={fields.cardNumber} error={errors.cardNumber} onChange={updateField} />
            <Field id="expiry" label="Expiry date" className="card-input" autoComplete="cc-exp" inputMode="numeric" maxLength="5"
              placeholder="MM/YY" value={fields.expiry} error={errors.expiry} onChange={updateField} />
            <Field id="cvv" label="CVV" className="card-input" autoComplete="cc-csc" inputMode="numeric" maxLength="3"
              placeholder="123" value={fields.cvv} error={errors.cvv} onChange={updateField} />
          </div>
        </fieldset>
      </div>
      <aside className="panel summary" aria-labelledby="summary-title">
        <h2 id="summary-title">Order summary</h2>
        <ul className="summary-items">
          {items.map(item => <li key={item.id}>
            <CardImage card={item.card} />
            <span>{item.name}<small>{item.quantity} × {money(item.price)}</small></span>
            <strong>{money(item.price * item.quantity)}</strong>
          </li>)}
        </ul>
        <div className="summary-row"><span>Subtotal</span><span>{money(cents)}</span></div>
        <div className="summary-row"><span>Shipping</span><span>Free</span></div>
        <div className="summary-row total"><span>Total</span><span>{money(cents)}</span></div>
        {stockProblems.length > 0 && <p className="account-error" role="alert">{stockProblems.join(' ')} Please update your bag.</p>}
        <button className="add pay-button" type="submit" disabled={paying}>Pay {money(cents)}</button>
        <p className="bank-status" role="status">{paying ? 'Contacting your bank…' : ''}</p>
      </aside>
    </form>;
  }

  return <section className="page" aria-labelledby="checkout-title">
    <Link className="back-link" to="/">← Back to shop</Link>
    <div className="catalog-heading">
      <div><h1 id="checkout-title">Checkout</h1><p>Enter your delivery address and card to place the order.</p></div>
    </div>
    {content}
  </section>;
}
