function createInMemoryReviewRepository({ orderItems = [], reviews = [] } = {}) {
  let nextId = reviews.length + 1;
  const items = orderItems.map((o) => ({ ...o }));
  const storedReviews = reviews.map((r) => ({ ...r }));

  return {
    orderItems: items,
    reviews: storedReviews,

    async findOrderItemForReview(orderItemId) {
      const item = items.find((o) => o.id === orderItemId);
      if (!item) return null;
      const existingReview = storedReviews.find((r) => r.orderItemId === orderItemId) ?? null;
      return {
        ...item,
        review: existingReview ? { id: existingReview.id } : null,
      };
    },

    async create({ orderItemId, userId, productId, rating, comment, commentStatus }) {
      const review = {
        id: nextId++,
        orderItemId,
        userId,
        productId,
        rating,
        comment,
        commentStatus,
        moderatedBy: null,
        createdAt: new Date(),
      };
      storedReviews.push(review);
      return review;
    },

    async listByProduct(productId) {
      return storedReviews
        .filter((r) => r.productId === productId)
        .map((r) => ({ ...r, user: { id: r.userId, name: `User ${r.userId}` } }));
    },

    async listPendingComments() {
      return storedReviews
        .filter((r) => r.commentStatus === 'pending' && r.comment !== null)
        .map((r) => ({
          ...r,
          user: { id: r.userId, name: `User ${r.userId}` },
          product: { id: r.productId, name: `Card ${r.productId}` },
        }));
    },

    async findById(id) {
      return storedReviews.find((r) => r.id === id) ?? null;
    },

    async moderateComment(id, { commentStatus, moderatedBy }) {
      const review = storedReviews.find((r) => r.id === id);
      if (!review) return null;
      review.commentStatus = commentStatus;
      review.moderatedBy = moderatedBy;
      return review;
    },
  };
}

module.exports = { createInMemoryReviewRepository };