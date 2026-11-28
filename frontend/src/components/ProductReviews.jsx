import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { request } from '../state/api.js';
import { eligiblePurchases } from '../state/orders-api.js';
import { useShop } from '../state/ShopContext.jsx';
import { Loading, RequestError } from './RequestState.jsx';

export function ProductReviews({ productId, onClose }) {
  const { user, authStatus, authorizedRequest } = useShop();
  const [summary, setSummary] = useState({ status: 'loading' });
  const [purchases, setPurchases] = useState({ status: 'loading', userId: null, orders: [] });
  const [reload, setReload] = useState(0);
  const [reloadPurchases, setReloadPurchases] = useState(0);
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [selected, setSelected] = useState('');
  const [reviewed, setReviewed] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setSummary({ status: 'loading' });
    request(`/reviews/product/${productId}`, { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data.comments) || !Number.isInteger(data.ratingCount) || !Number.isFinite(Number(data.averageRating))) {
          throw new Error('The shop returned incomplete review details. Please try again.');
        }
        if (!controller.signal.aborted) setSummary({ status: 'ready', ...data });
      })
      .catch(failure => { if (!controller.signal.aborted) setSummary({ status: 'error', error: failure.message }); });
    return () => controller.abort();
  }, [productId, reload]);

  useEffect(() => {
    if (authStatus !== 'ready' || user?.role !== 'customer') return;
    const controller = new AbortController();
    const userId = user.id;
    setPurchases({ status: 'loading', userId, orders: [] });
    setReviewed([]);
    setError('');
    setSuccess('');
    authorizedRequest('/orders', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setPurchases({ status: 'ready', userId, orders: data.orders }); })
      .catch(failure => { if (!controller.signal.aborted) setPurchases({ status: 'error', userId, orders: [], error: failure.message }); });
    return () => controller.abort();
  }, [user?.id, user?.role, authStatus, productId, authorizedRequest, reloadPurchases]);

  const ownPurchases = purchases.userId === user?.id;
  const eligible = ownPurchases ? eligiblePurchases(purchases.orders, productId, reviewed) : [];
  const orderItemId = eligible.some(item => String(item.orderItemId) === selected) ? Number(selected) : eligible[0]?.orderItemId;

  async function submit(event) {
    event.preventDefault();
    if (submitting || !orderItemId) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await authorizedRequest('/reviews', {
        method: 'POST', body: { orderItemId, rating: Number(rating), ...(comment.trim() ? { comment: comment.trim() } : {}) },
      });
      setReviewed(current => [...current, orderItemId]);
      setSuccess(comment.trim() ? 'Your rating was submitted. Your comment will appear after manager approval.' : 'Your rating was submitted.');
      setComment('');
      setReload(current => current + 1);
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 409) setReviewed(current => [...current, orderItemId]);
    } finally { setSubmitting(false); }
  }

  return <section className="detail-reviews" aria-labelledby="reviews-title">
    <h3 id="reviews-title">Ratings and reviews</h3>
    {summary.status === 'loading' && <Loading>Loading ratings and reviews...</Loading>}
    {summary.status === 'error' && <RequestError message={`Reviews could not be loaded. ${summary.error}`} onRetry={() => setReload(value => value + 1)} />}
    {summary.status === 'ready' && <>
      <p className="detail-rating-summary">{summary.ratingCount
        ? `${Number(summary.averageRating).toFixed(1)} out of 5 (${summary.ratingCount} ${summary.ratingCount === 1 ? 'rating' : 'ratings'})`
        : 'No ratings yet'}</p>
      {summary.comments?.filter(item => item.commentStatus === undefined || item.commentStatus === 'approved').length
        ? <ul className="review-list">{summary.comments.filter(item => item.commentStatus === undefined || item.commentStatus === 'approved').map(item => <li key={item.id}>
          <div className="review-item-meta"><strong>{item.authorName || 'Customer'}</strong><span>{item.rating} out of 5</span></div>
          <p>{item.comment}</p>
        </li>)}</ul>
        : <p className="field-help">No approved comments yet.</p>}
    </>}
    {authStatus === 'loading' && <Loading>Checking your account...</Loading>}
    {authStatus === 'ready' && !user && <p className="field-help"><Link to="/sign-in" onClick={onClose}>Sign in</Link> to review a delivered purchase.</p>}
    {user?.role === 'customer' && <>
      {(!ownPurchases || purchases.status === 'loading') && <Loading>Checking delivered purchases...</Loading>}
      {ownPurchases && purchases.status === 'error' && <RequestError message={`We could not check your purchases. ${purchases.error}`} onRetry={() => setReloadPurchases(value => value + 1)} />}
      {ownPurchases && purchases.status === 'ready' && (eligible.length ? <form className="review-form" onSubmit={submit} aria-busy={submitting}>
        <fieldset className="account-fields" disabled={submitting}>
          {eligible.length > 1 && <label>Delivered purchase
            <select aria-label="Delivered purchase" value={String(orderItemId)} onChange={event => setSelected(event.target.value)}>
              {eligible.map(item => <option key={item.orderItemId} value={item.orderItemId}>Order #{item.orderId}, item #{item.orderItemId}</option>)}
            </select>
          </label>}
          <label>Your rating
            <select aria-label="Your rating" value={rating} onChange={event => setRating(event.target.value)}>
              {[5, 4, 3, 2, 1].map(value => <option value={value} key={value}>{value} {value === 1 ? 'star' : 'stars'}</option>)}
            </select>
          </label>
          <label htmlFor="review-comment">Comment (optional)</label>
          <textarea id="review-comment" rows="3" maxLength="1000" value={comment} onChange={event => setComment(event.target.value)} />
          <p className="field-help">Ratings count immediately. Comments need manager approval. Each delivered purchase can be reviewed once.</p>
          <button className="add" type="submit">{submitting ? 'Submitting review...' : 'Submit review'}</button>
        </fieldset>
      </form> : <p className="field-help">No unreviewed delivered purchases are available for this card.</p>)}
    </>}
    {user && user.role !== 'customer' && <p className="field-help">Only customers with a delivered purchase can submit reviews.</p>}
    {error && <p className="account-error" role="alert">{error}</p>}
    {success && <p className="save-message" role="status">{success}</p>}
  </section>;
}
