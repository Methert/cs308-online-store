import { describe, expect, test } from 'vitest';
import {
  addReview,
  findEligibleOrderForProduct,
  productReviewSummary,
  sampleReviews,
} from './reviews.js';
import { sampleOrders } from './orders.js';

const trainer = { id: 'demo:trainer@example.com', name: 'Peko Trainer' };

describe('reviews state helpers', () => {
  test('counts all ratings immediately while showing only approved comments', () => {
    const summary = productReviewSummary(sampleReviews, 173);
    expect(summary.ratingCount).toBe(2);
    expect(summary.averageRating).toBe(4);
    expect(summary.approvedComments).toHaveLength(1);
    expect(summary.approvedComments[0].authorName).toBe('Misty');
  });

  test('allows review only when user has a delivered order for that product', () => {
    const delivered = findEligibleOrderForProduct(sampleOrders, sampleReviews, trainer, 166);
    const inTransit = findEligibleOrderForProduct(sampleOrders, sampleReviews, trainer, 173);
    const cancelled = findEligibleOrderForProduct(sampleOrders, sampleReviews, trainer, 198);

    expect(delivered?.id).toBe(1001);
    expect(inTransit).toBeNull();
    expect(cancelled).toBeNull();
  });

  test('new review with comment starts as pending and blocks duplicate order review', () => {
    const next = addReview(sampleReviews, {
      orderId: 1001,
      productId: 166,
      user: trainer,
      rating: 4,
      comment: 'Great Bulbasaur card!',
    });
    expect(next[0].commentStatus).toBe('pending');
    expect(findEligibleOrderForProduct(sampleOrders, next, trainer, 166)).toBeNull();
  });
});