import { useState } from 'react';
import { money } from '../state/cart.js';
import { rarityLabel } from '../state/catalog.js';
import { readOrders } from '../state/orders.js';
import {
  addReview,
  findEligibleOrderForProduct,
  hasUserReviewedProduct,
  productReviewSummary,
  readReviews,
  saveReviews,
} from '../state/reviews.js';
import { useShop } from '../state/ShopContext.jsx';
import { Modal } from './Modal.jsx';
import { AddToBagButton, CardImage, Stock, cardLabel } from './ProductCard.jsx';

export function ProductDialog({ card, onClose }) {
  const { user, message, setMessage } = useShop();
  const [reviews, setReviews] = useState(readReviews);
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState('');

  const summary = card ? productReviewSummary(reviews, card.id) : null;
  const orders = card ? readOrders() : [];
  const eligibleOrder = card ? findEligibleOrderForProduct(orders, reviews, user, card.id) : null;
  const alreadyReviewed = card ? hasUserReviewedProduct(reviews, user, card.id) : false;

  function handleSubmit(event) {
    event.preventDefault();
    if (!eligibleOrder || !card) return;
    setFormError('');
    try {
      const next = addReview(reviews, {
        orderId: eligibleOrder.id,
        productId: card.id,
        user,
        rating: Number(rating),
        comment,
      });
      saveReviews(next);
      setReviews(next);
      const hadComment = comment.trim() !== '';
      setComment('');
      setRating('5');
      setMessage(
        hadComment
          ? 'Rating published. Your comment is awaiting product manager approval.'
          : 'Rating published.',
      );
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <Modal open={Boolean(card)} onClose={onClose} titleId="detail-title" className="product-dialog">
      <button className="close" type="button" onClick={onClose} aria-label="Close card details">
        ×
      </button>
      {card && (
        <>
          <article className="detail" style={{ '--card-tone': card.tone }}>
            <div className="detail-art">
              <CardImage
                card={card}
                alt={card.imageUrl ? `${card.name} card` : 'Placeholder card artwork'}
              />
            </div>
            <div>
              <p className="card-id">{cardLabel(card)}</p>
              <h2 id="detail-title">{card.name}</h2>
              <p className="detail-description">
                {rarityLabel(card)} · {card.conditionLabel ?? 'Near mint'} · English
              </p>
              <p className="detail-description">{card.description}</p>
              <Stock card={card} />
              <p className="price">{money(card.price)}</p>
              <AddToBagButton card={card} />
            </div>
          </article>

          <section className="detail-reviews" aria-label="Customer reviews">
            <div className="detail-reviews-header">
              <h3>Ratings &amp; Reviews</h3>
              <p className="detail-rating-summary">
                {summary.ratingCount === 0
                  ? 'No ratings yet'
                  : `★ ${summary.averageRating} / 5 (${summary.ratingCount} ${summary.ratingCount === 1 ? 'rating' : 'ratings'})`}
              </p>
            </div>

            {!user && (
              <p className="detail-review-note">Sign in to rate or comment on delivered purchases.</p>
            )}

            {user && eligibleOrder && (
              <form className="review-form" onSubmit={handleSubmit}>
                <label htmlFor="review-rating">
                  Your rating
                  <select
                    id="review-rating"
                    aria-label="Rating"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                  >
                    <option value="5">5 stars</option>
                    <option value="4">4 stars</option>
                    <option value="3">3 stars</option>
                    <option value="2">2 stars</option>
                    <option value="1">1 star</option>
                  </select>
                </label>
                <label htmlFor="review-comment">
                  Comment (optional, requires manager approval)
                  <textarea
                    id="review-comment"
                    aria-label="Comment"
                    rows={2}
                    maxLength={1000}
                    placeholder="Share your thoughts on card condition and delivery..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                {formError && (
                  <p className="account-error" role="alert">
                    {formError}
                  </p>
                )}
                <button className="primary-btn" type="submit">
                  Submit review
                </button>
              </form>
            )}

            {user && !eligibleOrder && alreadyReviewed && (
              <p className="detail-review-note">You have already reviewed this card.</p>
            )}

            {user && !eligibleOrder && !alreadyReviewed && (
              <p className="detail-review-note">
                Only customers with a delivered purchase can rate or comment on this card.
              </p>
            )}

            {summary.approvedComments.length === 0 ? (
              <p className="detail-review-note">No approved comments yet.</p>
            ) : (
              <ul className="review-list">
                {summary.approvedComments.map((item) => (
                  <li key={item.id} className="review-item">
                    <div className="review-item-meta">
                      <strong>{item.authorName}</strong>
                      <span>★ {item.rating} / 5</span>
                    </div>
                    <p>{item.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <p className="detail-feedback" role="status">
        {message}
      </p>
    </Modal>
  );
}