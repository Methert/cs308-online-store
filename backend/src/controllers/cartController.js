import supabase from '../db/supabase.js';

function cartFilter(req) {
  return req.user ? { user_id: req.user.id } : { session_id: req.headers['x-session-id'] };
}

function requireOwner(req, res) {
  if (!req.user && !req.headers['x-session-id']) {
    res.status(400).json({ error: 'x-session-id header required for guest cart' });
    return false;
  }
  return true;
}

export async function getCart(req, res) {
  if (!requireOwner(req, res)) return;
  const { data, error } = await supabase
    .from('cart_items')
    .select(`
      id, quantity,
      product:product_id ( id, name, price, stock_quantity, image_url )
    `)
    .match(cartFilter(req));
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data });
}

export async function addItem(req, res) {
  if (!requireOwner(req, res)) return;
  const { product_id, quantity = 1 } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id is required' });

  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('id, stock_quantity')
    .eq('id', product_id)
    .single();
  if (pErr || !product) return res.status(404).json({ error: 'Product not found' });

  const filter = cartFilter(req);

  const { data: existing } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .match({ ...filter, product_id })
    .maybeSingle();

  const newQty = (existing?.quantity ?? 0) + quantity;
  if (product.stock_quantity < newQty) {
    return res.status(409).json({ error: 'Insufficient stock' });
  }

  if (existing) {
    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity: newQty })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  const { data, error } = await supabase
    .from('cart_items')
    .insert({ ...filter, product_id, quantity })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
}

export async function updateItem(req, res) {
  if (!requireOwner(req, res)) return;
  const { quantity } = req.body;
  if (quantity == null || quantity < 0) {
    return res.status(400).json({ error: 'quantity must be a non-negative integer' });
  }

  const filter = cartFilter(req);
  const { productId } = req.params;

  if (quantity === 0) {
    const { error } = await supabase.from('cart_items').delete().match({ ...filter, product_id: productId });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(204).send();
  }

  const { data: product } = await supabase
    .from('products').select('stock_quantity').eq('id', productId).single();
  if (product?.stock_quantity < quantity) {
    return res.status(409).json({ error: 'Insufficient stock' });
  }

  const { data, error } = await supabase
    .from('cart_items')
    .update({ quantity })
    .match({ ...filter, product_id: productId })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}

export async function removeItem(req, res) {
  if (!requireOwner(req, res)) return;
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .match({ ...cartFilter(req), product_id: req.params.productId });
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
}

export async function clearCart(req, res) {
  if (!requireOwner(req, res)) return;
  const { error } = await supabase.from('cart_items').delete().match(cartFilter(req));
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
}

// Called right after login to fold the guest cart into the user's cart.
export async function mergeGuestCart(req, res) {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  const { data: guestItems, error: fetchErr } = await supabase
    .from('cart_items')
    .select('product_id, quantity')
    .eq('session_id', session_id);
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!guestItems?.length) return res.json({ merged: 0 });

  const userId = req.user.id;
  for (const item of guestItems) {
    const { data: existing } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .match({ user_id: userId, product_id: item.product_id })
      .maybeSingle();

    if (existing) {
      await supabase
        .from('cart_items')
        .update({ quantity: existing.quantity + item.quantity })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('cart_items')
        .insert({ user_id: userId, product_id: item.product_id, quantity: item.quantity });
    }
  }

  await supabase.from('cart_items').delete().eq('session_id', session_id);
  res.json({ merged: guestItems.length });
}
