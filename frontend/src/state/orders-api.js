export function fromServerOrder(order) {
  return {
    id: order.id, userId: order.userId, status: order.status,
    date: order.createdAt, address: order.deliveryAddress,
    total: Math.round(Number(order.totalPrice) * 100),
    items: order.items.map(item => ({
      id: item.id, productId: item.productId, name: item.product?.name ?? 'Card',
      price: Math.round(Number(item.unitPrice) * 100), quantity: item.quantity,
    })),
  };
}

export function eligiblePurchases(orders, productId, excluded = []) {
  return orders.filter(order => order.status === 'delivered').flatMap(order =>
    order.items.filter(item => item.productId === productId && !excluded.includes(item.id))
      .map(item => ({ orderItemId: item.id, orderId: order.id, date: order.createdAt })),
  );
}
