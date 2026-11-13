import supabase from '../db/supabase.js';

const ORDER_SELECT = `
  id, status, total_price, delivery_address, created_at, updated_at,
  order_items (
    id, quantity, unit_price,
    product:product_id ( id, name, image_url )
  )
`;

export async function placeOrder(req, res) {
  const userId = req.user.id;
  const { delivery_address, payment_info } = req.body;

  if (!delivery_address) return res.status(400).json({ error: 'delivery_address is required' });
  if (!payment_info)     return res.status(400).json({ error: 'payment_info is required' });

  const { data: cartItems, error: cartErr } = await supabase
    .from('cart_items')
    .select(`quantity, product:product_id ( id, name, price, stock_quantity )`)
    .eq('user_id', userId);
  if (cartErr) return res.status(500).json({ error: cartErr.message });
  if (!cartItems?.length) return res.status(400).json({ error: 'Cart is empty' });

  for (const item of cartItems) {
    if (item.product.stock_quantity < item.quantity) {
      return res.status(409).json({
        error: `Insufficient stock for "${item.product.name}"`,
        product_id: item.product.id,
      });
    }
  }

  const totalPrice = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity, 0
  );

  // Mock bank: always approves (req. 4 — real gateway out of scope, req. 15)
  const bankApproved = true;
  if (!bankApproved) return res.status(402).json({ error: 'Payment declined' });

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({ user_id: userId, status: 'processing', total_price: totalPrice, delivery_address })
    .select()
    .single();
  if (orderErr) return res.status(500).json({ error: orderErr.message });

  const { error: itemsErr } = await supabase.from('order_items').insert(
    cartItems.map((item) => ({
      order_id:   order.id,
      product_id: item.product.id,
      quantity:   item.quantity,
      unit_price: item.product.price,
    }))
  );
  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  for (const item of cartItems) {
    await supabase
      .from('products')
      .update({ stock_quantity: item.product.stock_quantity - item.quantity })
      .eq('id', item.product.id);
  }

  await supabase.from('cart_items').delete().eq('user_id', userId);

  // TODO: generate invoice PDF and email to user (req. 4)

  res.status(201).json(order);
}

export async function getMyOrders(req, res) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ orders: data });
}

export async function getOrder(req, res) {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', req.params.orderId)
    .eq('user_id', req.user.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Order not found' });
  res.json(data);
}

export async function cancelOrder(req, res) {
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, order_items ( product_id, quantity )')
    .eq('id', req.params.orderId)
    .eq('user_id', req.user.id)
    .single();
  if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'processing') {
    return res.status(409).json({ error: 'Only orders with status "processing" can be cancelled' });
  }

  for (const item of order.order_items) {
    const { data: p } = await supabase
      .from('products').select('stock_quantity').eq('id', item.product_id).single();
    if (p) {
      await supabase
        .from('products')
        .update({ stock_quantity: p.stock_quantity + item.quantity })
        .eq('id', item.product_id);
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', req.params.orderId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}

export async function requestReturn(req, res) {
  const { reason } = req.body;
  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('id, status, created_at')
    .eq('id', req.params.orderId)
    .eq('user_id', req.user.id)
    .single();
  if (fetchErr || !order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'delivered') {
    return res.status(409).json({ error: 'Only delivered orders can be returned' });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (new Date(order.created_at) < thirtyDaysAgo) {
    return res.status(409).json({ error: 'Return window of 30 days has passed' });
  }

  const { data: returnReq, error: retErr } = await supabase
    .from('return_requests')
    .insert({ order_id: order.id, user_id: req.user.id, reason })
    .select()
    .single();
  if (retErr) return res.status(500).json({ error: retErr.message });

  await supabase.from('orders').update({ status: 'return-requested' }).eq('id', order.id);

  // TODO: notify sales manager (req. 16)

  res.status(201).json(returnReq);
}
