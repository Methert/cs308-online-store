// Rules for the cart and order requests (Kerem's routes use them through validateBody).
// A wrong request always gets the same answer as on every other route:
//   400 { "error": "Validation failed", "details": [{ "field", "message" }] }
const { z } = require('zod');
const { MAX_DB_INT } = require('./common');

// Nobody buys more than this many copies of one card; it also keeps the numbers small.
const MAX_CART_QUANTITY = 99;

// --- Cart --------------------------------------------------------------------

// POST /api/cart/items   { "productId": 5, "quantity": 1 }
const addCartItemSchema = z.object({
  productId: z
    .number({
      error: (issue) =>
        issue.input === undefined ? 'productId is required' : 'productId must be a number',
    })
    .int('productId must be a positive whole number')
    .min(1, 'productId must be a positive whole number')
    .max(MAX_DB_INT, 'productId is too large'),
  quantity: z
    .number({ error: 'quantity must be a number' })
    .int('quantity must be a positive whole number')
    .min(1, 'quantity must be a positive whole number')
    .max(MAX_CART_QUANTITY, `quantity must be at most ${MAX_CART_QUANTITY}`)
    .default(1),
});

// PUT /api/cart/items/:productId   { "quantity": 3 }   (0 removes the item)
const updateCartItemSchema = z.object({
  quantity: z
    .number({ error: 'quantity is required and must be a number' })
    .int('quantity must be a whole number')
    .min(0, 'quantity cannot be negative')
    .max(MAX_CART_QUANTITY, `quantity must be at most ${MAX_CART_QUANTITY}`),
});

// POST /api/cart/merge   { "guestToken": "..." }
const mergeCartSchema = z.object({
  guestToken: z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'guestToken is required' : 'guestToken must be text',
    })
    .trim()
    .min(1, 'guestToken is required')
    .max(200, 'guestToken is too long'),
});

// --- Orders ------------------------------------------------------------------

// POST /api/orders
// expiry and cvv may be sent by the checkout form. The mock bank does not check them, so they
// are dropped here and never stored.
const placeOrderSchema = z.object({
  deliveryAddress: z
    .string({ error: 'deliveryAddress is required' })
    .trim()
    .min(5, 'deliveryAddress must be at least 5 characters')
    .max(500, 'deliveryAddress is too long'),
  paymentInfo: z.object(
    {
      cardHolder: z
        .string({ error: 'paymentInfo.cardHolder is required' })
        .trim()
        .min(2, 'paymentInfo.cardHolder is required')
        .max(100, 'paymentInfo.cardHolder is too long'),
      // Spaces are allowed ("4111 1111 1111 1111"); a card number has 12 to 19 digits.
      cardNumber: z
        .string({ error: 'paymentInfo.cardNumber is required' })
        .transform((value) => value.replace(/\s/g, ''))
        .pipe(z.string().regex(/^\d{12,19}$/, 'paymentInfo.cardNumber must be 12 to 19 digits')),
    },
    { error: 'paymentInfo is required' },
  ),
});

module.exports = {
  MAX_CART_QUANTITY,
  addCartItemSchema,
  updateCartItemSchema,
  mergeCartSchema,
  placeOrderSchema,
};
