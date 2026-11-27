const { z } = require('zod');
const { AppError } = require('../utils/AppError');

const createReviewSchema = z.object({
  orderItemId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000).optional(),
});

const moderateCommentSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});

function parseId(raw, label = 'Id') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, `${label} must be a positive integer`);
  }
  return id;
}

module.exports = {
  createReviewSchema,
  moderateCommentSchema,
  parseId,
};