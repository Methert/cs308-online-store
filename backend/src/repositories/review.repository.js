function createReviewRepository(prisma) {
  return {
    findOrderItemForReview(orderItemId) {
      return prisma.orderItem.findUnique({
        where: { id: orderItemId },
        include: {
          order: { select: { userId: true, status: true } },
          review: { select: { id: true } },
        },
      });
    },

    create({ orderItemId, userId, productId, rating, comment, commentStatus }) {
      return prisma.review.create({
        data: {
          orderItemId,
          userId,
          productId,
          rating,
          comment,
          commentStatus,
        },
      });
    },

    listByProduct(productId) {
      return prisma.review.findMany({
        where: { productId },
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    listPendingComments() {
      return prisma.review.findMany({
        where: {
          commentStatus: 'pending',
          comment: { not: null },
        },
        include: {
          user: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
    },

    findById(id) {
      return prisma.review.findUnique({ where: { id } });
    },

    moderateComment(id, { commentStatus, moderatedBy }) {
      return prisma.review.update({
        where: { id },
        data: { commentStatus, moderatedBy },
      });
    },
  };
}

module.exports = { createReviewRepository };