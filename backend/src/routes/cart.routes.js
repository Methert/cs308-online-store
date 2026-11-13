// Endpoints under /api/cart
//   GET    /api/cart              -> get cart (guest or user)
//   POST   /api/cart/items        -> add item to cart
//   PUT    /api/cart/items/:id    -> update item quantity (0 = remove)
//   DELETE /api/cart/items/:id    -> remove item
//   DELETE /api/cart              -> clear cart
//   POST   /api/cart/merge        -> merge guest cart into user cart after login (req. 4)
//
// Guest carts are identified by the x-guest-token header (a UUID the frontend generates and
// stores in localStorage). After login, the frontend calls /merge once and discards the token.
const express = require('express');
const { AppError } = require('../utils/AppError');

function createCartRouter({ prisma, authenticate, optionalAuthenticate }) {
  const router = express.Router();

  // ----- helpers ---------------------------------------------------------------

  async function getOrCreateCart(tx, { userId, guestToken }) {
    if (!userId && !guestToken) {
      throw new AppError(400, 'x-guest-token header is required for guest carts');
    }
    const where = userId ? { userId } : { guestToken };
    const existing = await tx.cart.findUnique({ where, include: { items: true } });
    if (existing) return existing;
    return tx.cart.create({ data: where, include: { items: true } });
  }

  function cartOwner(req) {
    return req.user ? { userId: req.user.id } : { guestToken: req.headers['x-guest-token'] };
  }

  // ----- routes ----------------------------------------------------------------

  router.get('/', optionalAuthenticate, async (req, res) => {
    const owner = cartOwner(req);
    if (!req.user && !req.headers['x-guest-token']) {
      throw new AppError(400, 'x-guest-token header is required for guest carts');
    }

    const where = req.user ? { userId: req.user.id } : { guestToken: req.headers['x-guest-token'] };
    const cart = await prisma.cart.findUnique({
      where,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, price: true, stockQuantity: true, imageUrl: true },
            },
          },
        },
      },
    });

    res.json({ data: { items: cart?.items ?? [] } });
  });

  router.post('/items', optionalAuthenticate, async (req, res) => {
    const { productId, quantity = 1 } = req.body;
    if (!productId || !Number.isInteger(productId) || productId <= 0) {
      throw new AppError(400, 'productId must be a positive integer');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new AppError(400, 'quantity must be a positive integer');
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) throw new AppError(404, 'Product not found');

    const item = await prisma.$transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, cartOwner(req));

      const existing = cart.items.find((i) => i.productId === productId);
      const newQty = (existing?.quantity ?? 0) + quantity;

      if (product.stockQuantity < newQty) {
        throw new AppError(409, 'Not enough stock');
      }

      return tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        update: { quantity: newQty },
        create: { cartId: cart.id, productId, quantity },
      });
    });

    res.status(201).json({ data: item });
  });

  router.put('/items/:productId', optionalAuthenticate, async (req, res) => {
    const productId = Number(req.params.productId);
    const { quantity } = req.body;
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new AppError(400, 'quantity must be a non-negative integer');
    }

    const result = await prisma.$transaction(async (tx) => {
      const cart = await getOrCreateCart(tx, cartOwner(req));

      if (quantity === 0) {
        await tx.cartItem.delete({
          where: { cartId_productId: { cartId: cart.id, productId } },
        });
        return null;
      }

      const product = await tx.product.findUnique({ where: { id: productId } });
      if (product && product.stockQuantity < quantity) {
        throw new AppError(409, 'Not enough stock');
      }

      return tx.cartItem.update({
        where: { cartId_productId: { cartId: cart.id, productId } },
        data: { quantity },
      });
    });

    if (result === null) return res.status(204).send();
    res.json({ data: result });
  });

  router.delete('/items/:productId', optionalAuthenticate, async (req, res) => {
    const productId = Number(req.params.productId);
    const owner = cartOwner(req);
    const cart = await prisma.cart.findUnique({
      where: req.user ? { userId: req.user.id } : { guestToken: req.headers['x-guest-token'] },
    });
    if (cart) {
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id, productId },
      });
    }
    res.status(204).send();
  });

  router.delete('/', optionalAuthenticate, async (req, res) => {
    const cart = await prisma.cart.findUnique({
      where: req.user ? { userId: req.user.id } : { guestToken: req.headers['x-guest-token'] },
    });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    res.status(204).send();
  });

  // Called once right after login (req. 4): merge guest cart items into the user's cart.
  router.post('/merge', authenticate, async (req, res) => {
    const { guestToken } = req.body;
    if (!guestToken) throw new AppError(400, 'guestToken is required');

    const guestCart = await prisma.cart.findUnique({
      where: { guestToken },
      include: { items: true },
    });
    if (!guestCart?.items.length) return res.json({ data: { merged: 0 } });

    await prisma.$transaction(async (tx) => {
      const userCart = await getOrCreateCart(tx, { userId: req.user.id });

      for (const item of guestCart.items) {
        const existing = userCart.items.find((i) => i.productId === item.productId);
        const newQty = (existing?.quantity ?? 0) + item.quantity;
        await tx.cartItem.upsert({
          where: { cartId_productId: { cartId: userCart.id, productId: item.productId } },
          update: { quantity: newQty },
          create: { cartId: userCart.id, productId: item.productId, quantity: newQty },
        });
      }
      await tx.cart.delete({ where: { id: guestCart.id } });
    });

    res.json({ data: { merged: guestCart.items.length } });
  });

  return router;
}

module.exports = { createCartRouter };
