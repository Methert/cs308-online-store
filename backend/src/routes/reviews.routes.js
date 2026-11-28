// Endpoints under /api/reviews (Requirements 5 and 12)
const express = require('express');
const { validateBody } = require('../middleware/validateBody');
const {
  createReviewSchema,
  moderateCommentSchema,
  parseId,
} = require('../validators/review.schemas');

function createReviewRouter({ reviewService, authenticate, requireRole, ROLES }) {
  const router = express.Router();
  const customerOnly = [authenticate, requireRole(ROLES.CUSTOMER)];
  const productManagerOnly = [authenticate, requireRole(ROLES.PRODUCT_MANAGER)];

  // Public: rating stats (immediate) + approved comments only
  router.get('/product/:productId', async (req, res) => {
    const productId = parseId(req.params.productId, 'Product id');
    const result = await reviewService.getProductReviews(productId);
    res.status(200).json({ data: result });
  });

  // Customer: submit rating and optional comment for a delivered order item
  router.post('/', ...customerOnly, validateBody(createReviewSchema), async (req, res) => {
    const review = await reviewService.submitReview(req.user.id, req.body);
    res.status(201).json({ data: { review } });
  });

  // Product Manager: view pending comment queue
  router.get('/moderation/pending', ...productManagerOnly, async (req, res) => {
    const reviews = await reviewService.listPendingComments();
    res.status(200).json({ data: { reviews } });
  });

  // Product Manager: approve or reject a comment
  router.patch(
    '/:id/moderate',
    ...productManagerOnly,
    validateBody(moderateCommentSchema),
    async (req, res) => {
      const reviewId = parseId(req.params.id, 'Review id');
      const review = await reviewService.moderateComment(reviewId, req.user.id, req.body);
      res.status(200).json({ data: { review } });
    },
  );

  return router;
}

module.exports = { createReviewRouter };