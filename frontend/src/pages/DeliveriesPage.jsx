import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { money } from '../state/cart.js';
import { toCents } from '../state/inventory.js';
import { formatDate, statusLabels } from '../state/orders.js';
import { Loading, RequestError } from '../components/RequestState.jsx';
import { useShop } from '../state/ShopContext.jsx';
import './pages.css';

// cancelled orders are never in the delivery list
const statusFilters = ['all', 'processing', 'in_transit', 'delivered'];

// an order only moves one step forward, this is the button for the next step
const nextStep = {
  processing: { status: 'in_transit', label: 'Mark in transit' },
  in_transit: { status: 'delivered', label: 'Mark delivered' },
};

// Product manager screen with every ordered card that has to be shipped (Req. 12).
export function DeliveriesPage() {
  const { user, authStatus, authorizedRequest } = useShop();
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [resource, setResource] = useState({ status: 'loading', deliveries: [], totalPages: 1 });
  const [reload, setReload] = useState(0);
  // id of the order that is being updated right now
  const [updating, setUpdating] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isManager = user?.role === 'product_manager';

  useEffect(() => {
    if (!isManager || authStatus !== 'ready') return;
    const controller = new AbortController();
    const query = status === 'all' ? `?page=${page}` : `?status=${status}&page=${page}`;
    setResource({ status: 'loading', deliveries: [], totalPages: 1 });
    authorizedRequest(`/deliveries${query}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResource({ status: 'ready', deliveries: data.deliveries, totalPages: data.pagination.totalPages }); })
      .catch(err => { if (!controller.signal.aborted) setResource({ status: 'error', deliveries: [], totalPages: 1, error: err.message }); });
    return () => controller.abort();
  }, [isManager, user?.id, authStatus, authorizedRequest, status, page, reload]);

  function changeFilter(value) {
    setStatus(value);
    setPage(1);
  }

  async function moveForward(delivery) {
    const next = nextStep[delivery.status];
    setUpdating(delivery.orderId);
    setMessage('');
    setError('');
    try {
      const data = await authorizedRequest(`/orders/${delivery.orderId}/status`, { method: 'PATCH', body: { status: next.status } });
      // the status belongs to the whole order, so every card of that order changes
      // (completed is true when the order is delivered, like in the delivery_list view)
      setResource(current => ({
        ...current,
        deliveries: current.deliveries.map(row => (row.orderId === delivery.orderId
          ? { ...row, status: data.order.status, completed: data.order.status === 'delivered' }
          : row)),
      }));
      setMessage(`Order #${delivery.orderId} is now ${statusLabels[data.order.status].toLowerCase()}.`);
    } catch (err) {
      setError(`Order #${delivery.orderId}: ${err.message}`);
      // 409 means the order was changed by someone else (for example cancelled), so load the list again
      if (err.status === 409) setReload(value => value + 1);
    } finally {
      setUpdating(null);
    }
  }

  if (authStatus === 'loading') return <Loading>Checking staff access...</Loading>;
  if (!isManager) return <section className="page empty">
    <h1>Product manager access required</h1><p>Sign in with a product manager account to open this page.</p>
    {!user && <Link className="secondary" to="/sign-in" state={{ from: '/deliveries' }}>Sign in</Link>}
  </section>;

  let list;
  if (resource.status === 'loading') {
    list = <Loading>Loading deliveries...</Loading>;
  } else if (resource.status === 'error') {
    list = <RequestError message={`Deliveries could not be loaded. ${resource.error}`} onRetry={() => setReload(value => value + 1)} />;
  } else if (resource.deliveries.length === 0) {
    list = <div className="empty">
      <h2>{status === 'all' ? 'No deliveries yet' : `No orders are ${statusLabels[status].toLowerCase()}`}</h2>
      <p>Orders that customers place will show up here.</p>
    </div>;
  } else {
    list = <div className="table-wrap">
      <table className="data-table">
        <thead><tr>
          <th scope="col">Delivery ID</th><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Card</th>
          <th scope="col" className="number">Qty</th><th scope="col" className="number">Total</th><th scope="col">Address</th>
          <th scope="col">Ordered on</th><th scope="col">Status</th><th scope="col">Completed</th><th scope="col">Action</th>
        </tr></thead>
        <tbody>
          {/* Req. 12 lists these fields: delivery ID, customer ID, product ID, quantity, total price, address, completed */}
          {resource.deliveries.map(delivery => {
            const next = nextStep[delivery.status];
            return <tr key={delivery.deliveryId}>
              <th scope="row">{delivery.deliveryId}</th>
              <td>#{delivery.orderId}</td>
              <td>{delivery.customerName}<small className="id-note">ID {delivery.customerId}</small></td>
              <td>{delivery.productName}<small className="id-note">ID {delivery.productId}</small></td>
              <td className="number">{delivery.quantity}</td>
              <td className="number">{money(toCents(delivery.totalPrice))}</td>
              <td className="address-cell">{delivery.deliveryAddress}</td>
              <td>{formatDate(delivery.orderedAt)}</td>
              <td><span className={`status ${delivery.status}`}>{statusLabels[delivery.status]}</span></td>
              <td>{delivery.completed ? 'Yes' : 'No'}</td>
              <td>{next && <button className="small-button" type="button" disabled={updating === delivery.orderId}
                onClick={() => moveForward(delivery)} aria-label={`${next.label}: order #${delivery.orderId}, ${delivery.productName}`}>
                {next.label}
              </button>}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>;
  }

  return <section className="page" aria-labelledby="deliveries-title">
    <Link className="back-link" to="/manage">← Back to manage products</Link>
    <div className="catalog-heading">
      <div><h1 id="deliveries-title">Delivery list</h1><p>Every ordered card that has to be shipped, oldest order first.</p></div>
    </div>
    <div className="page-tools">
      <div className="filters" role="group" aria-label="Delivery status">
        {statusFilters.map(value => <button type="button" key={value} aria-pressed={status === value} onClick={() => changeFilter(value)}>
          {value === 'all' ? 'All' : statusLabels[value]}
        </button>)}
      </div>
    </div>
    <p className="save-message" role="status">{message}</p>
    {error && <p className="account-error" role="alert">{error}</p>}
    {list}
    {resource.status === 'ready' && resource.totalPages > 1 && <div className="pager">
      <button className="secondary" type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page} of {resource.totalPages}</span>
      <button className="secondary" type="button" disabled={page >= resource.totalPages} onClick={() => setPage(page + 1)}>Next</button>
    </div>}
  </section>;
}
