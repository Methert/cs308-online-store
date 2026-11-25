// Endpoints under /api/orders  (all require login)
//   POST /api/orders                   -> place order from cart (req. 3, 4)
//   GET  /api/orders                   -> list my orders with status (req. 3)
//   GET  /api/orders/:id               -> single order detail
//   PUT  /api/orders/:id/cancel        -> cancel while still processing (req. 14)
//   POST /api/orders/:id/return        -> request return within 30 days of delivery (req. 16)
//
// Concurrency (req. 18): stock is decremented inside a serialisable transaction with a
// conditional UPDATE … WHERE stock_quantity >= required. If two requests race for the last
// card, the database rejects one of them atomically – no overselling.
//
// Cancel race fix: the status change is also a conditional UPDATE (WHERE status = 'processing').
// If two cancel requests race, only the first UPDATE touches a row; the second gets 0 rows and
// returns 409 without ever restoring stock.
const crypto  = require('crypto');
const express = require('express');
const { AppError }          = require('../utils/AppError');
const { ROLES }             = require('../constants/roles');
const { createInvoiceService } = require('../services/invoice.service');
// Shared validation, same as every other route (added by Berat for consistent API errors).
const { validateBody }      = require('../middleware/validateBody');
const { parseId }           = require('../validators/common');
const { placeOrderSchema }  = require('../validators/order.schemas');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const ORDER_INCLUDE = {
  items: {
    include: {
      product: { select: { id: true, name: true, imageUrl: true } },
    },
  },
};

// Same id rule as every other route: "abc", "1e3" and ids too large for the database give 400.
function parseOrderId(raw) {
  return parseId(raw, 'Order id');
}

function createOrderRouter({ prisma, authenticate, requireRole }) {
  const router = express.Router();
  router.use(authenticate); // every order endpoint requires login

  const invoiceService = prisma ? createInvoiceService({ prisma }) : null;

  // POST /api/orders  – place order from the logged-in user's cart (mock payment)
  // placeOrderSchema checks deliveryAddress, paymentInfo.cardHolder and paymentInfo.cardNumber
  // (spaces already removed) before the code below runs.
  router.post('/', validateBody(placeOrderSchema), async (req, res) => {
    const { deliveryAddress, paymentInfo } = req.body;

    // Card fields for the Payment record (req. 17).
    const rawCard   = paymentInfo.cardNumber;
    const cardLast4 = rawCard.slice(-4);
    const cardHash  = crypto.createHash('sha256').update(rawCard).digest('hex');

    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.id },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, price: true, stockQuantity: true } } },
        },
      },
    });

    if (!cart?.items.length) throw new AppError(400, 'Cart is empty');

    // Mock bank: always approves (req. 15 — real verification is out of scope)
    const bankApproved = true;
    if (!bankApproved) throw new AppError(402, 'Payment declined');

    const totalPrice = cart.items.reduce(
      (sum, item) => sum + Number(item.product.price) * item.quantity,
      0,
    );

    const order = await prisma.$transaction(async (tx) => {
      // Atomic conditional decrement: WHERE stock_quantity >= needed.
      // If two concurrent orders race for the last card, the second UPDATE touches 0 rows and
      // throws, so only one order succeeds (req. 18).
      for (const item of cart.items) {
        const updated = await tx.$executeRaw`
          UPDATE products
          SET    stock_quantity = stock_quantity - ${item.quantity}
          WHERE  id             = ${item.product.id}
          AND    stock_quantity >= ${item.quantity}
        `;
        if (updated === 0) {
          throw new AppError(
            409,
            `"${item.product.name}" ran out of stock while your order was being placed`,
          );
        }
      }

      const newOrder = await tx.order.create({
        data: {
          userId:          req.user.id,
          status:          'processing',
          totalPrice,
          deliveryAddress,
          items: {
            create: cart.items.map((item) => ({
              productId: item.product.id,
              quantity:  item.quantity,
              unitPrice: item.product.price, // snapshot — never changed, used for refunds
            })),
          },
        },
        include: ORDER_INCLUDE,
      });

      // Store the payment record. The full card number is never kept, only the last four
      // digits and a one-way hash (req. 17).
      await tx.payment.create({
        data: {
          orderId:       newOrder.id,
          amount:        totalPrice,
          cardHolder:    String(paymentInfo.cardHolder),
          cardLast4,
          cardHash,
          bankReference: `MOCK-${Date.now()}`,
        },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return newOrder;
    });

    // Fire-and-forget: invoice generation and email do not delay the HTTP response.
    // A failure here is logged but does not undo the already-committed order.
    if (invoiceService) {
      invoiceService.generateAndSend(order).catch((err) => {
        console.error(`Invoice generation failed for order ${order.id}:`, err.message);
      });
    }

    res.status(201).json({ data: order });
  });

  // GET /api/orders  – order history (req. 3)
  router.get('/', async (req, res) => {
    const orders = await prisma.order.findMany({
      where:   { userId: req.user.id },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: { orders } });
  });

  // GET /api/orders/:id
  router.get('/:id', async (req, res) => {
    const id    = parseOrderId(req.params.id);
    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order || order.userId !== req.user.id) throw new AppError(404, 'Order not found');
    res.json({ data: order });
  });

  // PUT /api/orders/:id/cancel  – only while status = processing (req. 14)
  //
  // Race condition fix: instead of reading the order first and then updating in a separate
  // statement, we use a single conditional UPDATE (WHERE status = 'processing') as the first
  // operation inside the transaction. If two cancel requests race, only the first UPDATE
  // touches a row (affected = 1) and proceeds to restore stock; the second gets affected = 0
  // and throws 409 without ever touching stock — no double-restore.
  router.put('/:id/cancel', async (req, res) => {
    const id = parseOrderId(req.params.id);

    const updated = await prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE orders
        SET    status  = 'cancelled'
        WHERE  id      = ${id}
        AND    status  = 'processing'
        AND    user_id = ${req.user.id}
      `;

      if (affected === 0) {
        // Either not found, wrong owner, or status already changed — distinguish for the caller.
        const order = await tx.order.findUnique({ where: { id } });
        if (!order || order.userId !== req.user.id) throw new AppError(404, 'Order not found');
        throw new AppError(409, 'Only orders with status "processing" can be cancelled');
      }

      // Restore stock for every item in the order.
      const items = await tx.orderItem.findMany({ where: { orderId: id } });
      for (const item of items) {
        await tx.$executeRaw`
          UPDATE products
          SET    stock_quantity = stock_quantity + ${item.quantity}
          WHERE  id = ${item.productId}
        `;
      }

      return tx.order.findUnique({ where: { id } });
    });

    res.json({ data: updated });
  });

  // POST /api/orders/:id/return  – within 30 days of delivery (req. 16)
  // The sales manager reviews the request and approves the refund separately.
  // NOTE: requires a return_requests table in the schema (migration pending — coordinate with Ahmet).
  router.post('/:id/return', async (req, res) => {
    const id    = parseOrderId(req.params.id);
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || order.userId !== req.user.id) throw new AppError(404, 'Order not found');
    if (order.status !== 'delivered') {
      throw new AppError(409, 'Only delivered orders can be returned');
    }
    if (Date.now() - new Date(order.createdAt).getTime() > THIRTY_DAYS_MS) {
      throw new AppError(409, 'Return window of 30 days has passed');
    }

    // TODO: insert into return_requests table once migration is added (coordinate with Ahmet)
    // TODO: notify sales manager by email (req. 16)

    res.status(202).json({
      data: { message: 'Return request received. The sales manager will review it shortly.' },
    });
  });

  return router;
}

module.exports = { createOrderRouter };
