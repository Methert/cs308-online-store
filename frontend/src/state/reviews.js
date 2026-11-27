// Reviews and ratings state (Requirement 5: ratings publish immediately; comments wait for PM approval).

export const REVIEWS_KEY = 'peko-cards-reviews-v1';

export const sampleReviews = [
  {
    id: 1,
    orderId: 901,
    productId: 173, // Pikachu
    userId: 'demo:misty@example.com',
    authorName: 'Misty',
    rating: 5,
    comment: 'Centered print and crisp holo foil!',
    commentStatus: 'approved',
    createdAt: '2026-10-20T12:00:00.000Z',
  },
  {
    id: 2,
    orderId: 902,
    productId: 173, // Pikachu
    userId: 'demo:brock@example.com',
    authorName: 'Brock',
    rating: 3,
    comment: 'Waiting for manager moderation.',
    commentStatus: 'pending',
    createdAt: '2026-10-22T15:30:00.000Z',
  },
];

export function readReviews() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(REVIEWS_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    // fallback to sample reviews
  }
  return sampleReviews;
}

export function saveReviews(reviews) {
  try {
    window.localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
    return true;
  } catch {
    return false;
  }
}

export function productReviewSummary(reviews, productId) {
  const forProduct = reviews.filter((r) => r.productId === productId);
  const ratingCount = forProduct.length;
  const averageRating =
    ratingCount === 0
      ? 0
      : Number((forProduct.reduce((sum, r) => sum + r.rating, 0) / ratingCount).toFixed(2));

  // Only approved comments are shown publicly (Req #5)
  const approvedComments = forProduct
    .filter((r) => Boolean(r.comment) && r.commentStatus === 'approved')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return { ratingCount, averageRating, approvedComments };
}

export function findEligibleOrderForProduct(orders, reviews, user, productId) {
  if (!user) return null;
  return (
    orders.find(
      (order) =>
        order.userId === user.id &&
        order.status === 'delivered' &&
        // Support both demo format (item.id = productId) and API format (item.product.id = productId)
        order.items.some((item) => (item.product?.id ?? item.productId ?? item.id) === productId) &&
        !reviews.some(
          (r) => r.orderId === order.id && r.productId === productId && r.userId === user.id,
        ),
    ) ?? null
  );
}

export function hasUserReviewedProduct(reviews, user, productId) {
  if (!user) return false;
  return reviews.some((r) => r.userId === user.id && r.productId === productId);
}

export function addReview(reviews, { orderId, productId, user, rating, comment }) {
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new Error('Rating must be between 1 and 5.');
  }
  const normalizedComment = typeof comment === 'string' && comment.trim() !== '' ? comment.trim() : null;
  const nextId = reviews.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const entry = {
    id: nextId,
    orderId,
    productId,
    userId: user.id,
    authorName: user.name,
    rating: numericRating,
    comment: normalizedComment,
    commentStatus: normalizedComment ? 'pending' : null,
    createdAt: new Date().toISOString(),
  };
  return [entry, ...reviews];
}

// Fetches the public review summary for a product from the backend.
// Returns { productId, ratingCount, averageRating, comments } or null on failure.
export async function fetchProductReviews(productId) {
  try {
    const res = await fetch(`/api/reviews/product/${productId}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return data ?? null;
  } catch {
    return null;
  }
}
