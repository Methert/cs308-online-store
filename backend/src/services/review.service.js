const { AppError } = require('../utils/AppError');

function createReviewService({ reviewRepository }) {
  return {
    async submitReview(userId, { orderItemId, rating, comment }) {
      const orderItem = await reviewRepository.findOrderItemForReview(orderItemId);
      if (!orderItem) {
        throw new AppError(404, 'Order item not found');
      }
      if (orderItem.order.userId !== userId) {
        throw new AppError(403, 'You can only review your own purchases');
      }
      if (orderItem.order.status !== 'delivered') {
        throw new AppError(403, 'Products must be delivered before you can rate or comment');
      }
      if (orderItem.review) {
        throw new AppError(409, 'You have already reviewed this purchased item');
      }

      const normalizedComment = comment && comment.trim() !== '' ? comment.trim() : null;
      const commentStatus = normalizedComment ? 'pending' : null;

      return reviewRepository.create({
        orderItemId,
        userId,
        productId: orderItem.productId,
        rating,
        comment: normalizedComment,
        commentStatus,
      });
    },

    async getProductReviews(productId) {
      const allReviews = await reviewRepository.listByProduct(productId);
      const ratingCount = allReviews.length;
      const averageRating =
        ratingCount === 0
          ? 0
          : Number((allReviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount).toFixed(2));

      // Requirement 5: Ratings apply immediately; comments show only after PM approval.
      const comments = allReviews
        .filter((r) => r.comment !== null && r.commentStatus === 'approved')
        .map((r) => ({
          id: r.id,
          userId: r.userId,
          authorName: r.user?.name ?? null,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
        }));

      return { productId, ratingCount, averageRating, comments };
    },

    async listPendingComments() {
      return reviewRepository.listPendingComments();
    },

    async moderateComment(reviewId, managerId, { decision }) {
      const review = await reviewRepository.findById(reviewId);
      if (!review) {
        throw new AppError(404, 'Review not found');
      }
      if (!review.comment) {
        throw new AppError(400, 'This review has no comment to moderate');
      }
      return reviewRepository.moderateComment(reviewId, {
        commentStatus: decision,
        moderatedBy: managerId,
      });
    },
  };
}

module.exports = { createReviewService };