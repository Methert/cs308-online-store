// Database schema tests: every migration is applied to a fresh in-memory PostgreSQL (PGlite),
// then each test checks one rule the database itself must enforce.
// Run with `npm run test:db`. No running database or .env is needed.
// These use Node's test runner instead of Jest because PGlite is an ES module.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prisma',
  'migrations',
);

// Migration folders start with a timestamp, so sorting by name applies them in order.
const migrations = fs
  .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) => fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));

let db;

// One customer, one product manager, one card set and one card with a single copy in stock.
beforeEach(async () => {
  db = new PGlite();
  for (const sql of migrations) await db.exec(sql);
  await db.exec(`
    INSERT INTO users (name, email, password_hash, role, tax_id, updated_at) VALUES
      ('Ash', 'ash@example.com', 'hash', 'customer', '12345678901', now()),
      ('Oak', 'oak@example.com', 'hash', 'product_manager', NULL, now());
    INSERT INTO categories (name, set_code, series, release_date)
      VALUES ('Scarlet & Violet 151', 'sv3pt5', 'Scarlet & Violet', '2023-09-22');
    INSERT INTO products (category_id, name, model, serial_number, rarity, condition, description, stock_quantity, price, warranty_status, distributor, updated_at)
      VALUES (1, 'Charizard ex', '199/165', 'SV151-199-NM', 'Special Illustration Rare', 'near_mint', 'Special illustration rare', 1, 129.00, 'Authenticity and condition guarantee', 'Example Distributor', now());
  `);
});

// Each test gets its own database; close it so the process can exit.
afterEach(async () => {
  await db.close();
});

// A delivered order for Ash containing the card, so reviews have a purchase to point at.
async function addDeliveredOrder() {
  await db.exec(`
    INSERT INTO orders (user_id, status, total_price, delivery_address, updated_at) VALUES (1, 'delivered', 129.00, 'Istanbul', now());
    INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (1, 1, 1, 129.00);
  `);
}

async function assertRejected(sql, constraint) {
  await assert.rejects(db.exec(sql), (err) => {
    assert.match(err.message, new RegExp(constraint));
    return true;
  });
}

test('every table has row level security enabled', async () => {
  const { rows } = await db.query(`
    SELECT relname FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
      AND relname <> '_prisma_migrations' AND NOT relrowsecurity`);
  assert.deepEqual(rows, []);
});

test('two users cannot share an email', async () => {
  await assertRejected(
    `INSERT INTO users (name, email, password_hash, updated_at) VALUES ('Gary', 'ash@example.com', 'hash', now())`,
    'users_email_key',
  );
});

test('a new user is a customer by default', async () => {
  await db.exec(
    `INSERT INTO users (name, email, password_hash, updated_at) VALUES ('Misty', 'misty@example.com', 'hash', now())`,
  );
  const { rows } = await db.query(`SELECT role FROM users WHERE email = 'misty@example.com'`);
  assert.equal(rows[0].role, 'customer');
});

test('stock cannot go below zero', async () => {
  await assertRejected(
    `UPDATE products SET stock_quantity = -1 WHERE id = 1`,
    'products_stock_quantity_check',
  );
});

test('a price cannot be negative', async () => {
  await assertRejected(`UPDATE products SET price = -1 WHERE id = 1`, 'products_price_check');
});

test('the last card sells only once with the conditional stock update', async () => {
  const sell = `UPDATE products SET stock_quantity = stock_quantity - 1 WHERE id = 1 AND stock_quantity >= 1`;
  const first = await db.query(sell);
  const second = await db.query(sell);
  assert.equal(first.affectedRows, 1);
  assert.equal(second.affectedRows, 0);
});

test('a category that still has products cannot be deleted', async () => {
  await assertRejected(`DELETE FROM categories WHERE id = 1`, 'products_category_id_fkey');
});

test('a product that was ordered cannot be deleted', async () => {
  await addDeliveredOrder();
  await assertRejected(`DELETE FROM products WHERE id = 1`, 'order_items_product_id_fkey');
});

test('a cart needs a user or a guest token', async () => {
  await assertRejected(`INSERT INTO carts (updated_at) VALUES (now())`, 'carts_owner_check');
});

test('a user has at most one cart', async () => {
  await db.exec(`INSERT INTO carts (user_id, updated_at) VALUES (1, now())`);
  await assertRejected(
    `INSERT INTO carts (user_id, updated_at) VALUES (1, now())`,
    'carts_user_id_key',
  );
});

test('a cart item needs a quantity above zero', async () => {
  await db.exec(`INSERT INTO carts (guest_token, updated_at) VALUES ('guest-1', now())`);
  await assertRejected(
    `INSERT INTO cart_items (cart_id, product_id, quantity) SELECT id, 1, 0 FROM carts WHERE guest_token = 'guest-1'`,
    'cart_items_quantity_check',
  );
});

test('deleting a cart deletes its items', async () => {
  await db.exec(`
    INSERT INTO carts (guest_token, updated_at) VALUES ('guest-1', now());
    INSERT INTO cart_items (cart_id, product_id, quantity) SELECT id, 1, 1 FROM carts WHERE guest_token = 'guest-1';
    DELETE FROM carts WHERE guest_token = 'guest-1';`);
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM cart_items`);
  assert.equal(rows[0].n, 0);
});

test('an order status must be one of the known values', async () => {
  await assertRejected(
    `INSERT INTO orders (user_id, status, total_price, delivery_address, updated_at) VALUES (1, 'shipped', 10, 'Istanbul', now())`,
    'invalid input value for enum order_status',
  );
});

test('an order line needs a quantity above zero', async () => {
  await addDeliveredOrder();
  await assertRejected(
    `UPDATE order_items SET quantity = 0 WHERE id = 1`,
    'order_items_quantity_check',
  );
});

test('a rating without a comment is accepted', async () => {
  await addDeliveredOrder();
  await db.exec(
    `INSERT INTO reviews (order_item_id, user_id, product_id, rating) VALUES (1, 1, 1, 5)`,
  );
  const { rows } = await db.query(`SELECT rating, comment_status FROM reviews`);
  assert.deepEqual(rows, [{ rating: 5, comment_status: null }]);
});

test('a rating must be between 1 and 5', async () => {
  await addDeliveredOrder();
  await assertRejected(
    `INSERT INTO reviews (order_item_id, user_id, product_id, rating) VALUES (1, 1, 1, 6)`,
    'reviews_rating_check',
  );
});

test('a purchase can be reviewed only once', async () => {
  await addDeliveredOrder();
  await db.exec(
    `INSERT INTO reviews (order_item_id, user_id, product_id, rating) VALUES (1, 1, 1, 5)`,
  );
  await assertRejected(
    `INSERT INTO reviews (order_item_id, user_id, product_id, rating) VALUES (1, 1, 1, 4)`,
    'reviews_order_item_id_key',
  );
});

test('a comment always has an approval status', async () => {
  await addDeliveredOrder();
  await assertRejected(
    `INSERT INTO reviews (order_item_id, user_id, product_id, rating, comment) VALUES (1, 1, 1, 5, 'Great card')`,
    'reviews_comment_status_check',
  );
  await db.exec(
    `INSERT INTO reviews (order_item_id, user_id, product_id, rating, comment, comment_status) VALUES (1, 1, 1, 5, 'Great card', 'pending')`,
  );
});

// Inserts a second copy of the seeded card; `columns` overrides the defaults.
function insertCard(columns = {}) {
  const values = {
    category_id: 1,
    name: "'Charizard ex'",
    model: "'199/165'",
    serial_number: "'SV151-199-EX'",
    rarity: "'Special Illustration Rare'",
    description: "'Special illustration rare'",
    price: 99,
    warranty_status: "'Authenticity and condition guarantee'",
    distributor: "'Example Distributor'",
    updated_at: 'now()',
    ...columns,
  };
  return `INSERT INTO products (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).join(', ')})`;
}

test('the same card in another condition is a separate product', async () => {
  await db.exec(insertCard({ condition: "'excellent'" }));
  const { rows } = await db.query(
    `SELECT condition, price FROM products WHERE model = '199/165' ORDER BY id`,
  );
  assert.deepEqual(
    rows.map((row) => row.condition),
    ['near_mint', 'excellent'],
  );
});

test('a card is near mint unless a condition is given', async () => {
  await db.exec(insertCard());
  const { rows } = await db.query(
    `SELECT condition FROM products WHERE serial_number = 'SV151-199-EX'`,
  );
  assert.equal(rows[0].condition, 'near_mint');
});

test('a condition must be one of the known grades', async () => {
  await assertRejected(
    insertCard({ condition: "'like_new'" }),
    'invalid input value for enum card_condition',
  );
});

test('two products cannot share a stock code', async () => {
  await assertRejected(
    insertCard({ serial_number: "'SV151-199-NM'" }),
    'products_serial_number_key',
  );
});

test('a card needs a rarity', async () => {
  await assertRejected(insertCard({ rarity: "'  '" }), 'products_rarity_check');
});

test('two card sets cannot share a set code', async () => {
  await assertRejected(
    `INSERT INTO categories (name, set_code) VALUES ('Another set', 'sv3pt5')`,
    'categories_set_code_key',
  );
});

const payment = (columns = {}) => {
  const values = {
    order_id: 1,
    amount: 129,
    card_holder: "'Ash Ketchum'",
    card_last4: "'4242'",
    card_hash: "'hash'",
    bank_reference: "'MOCK-1'",
    ...columns,
  };
  return `INSERT INTO payments (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).join(', ')})`;
};

test('an order has at most one payment', async () => {
  await addDeliveredOrder();
  await db.exec(payment());
  await assertRejected(payment({ bank_reference: "'MOCK-2'" }), 'payments_order_id_key');
});

test('a payment stores exactly four card digits', async () => {
  await addDeliveredOrder();
  await assertRejected(payment({ card_last4: "'42a2'" }), 'payments_card_last4_check');
});

test('two invoices cannot share an invoice number', async () => {
  await addDeliveredOrder();
  await db.exec(`
    INSERT INTO orders (user_id, total_price, delivery_address, updated_at) VALUES (1, 10, 'Istanbul', now());
    INSERT INTO invoices (order_id, invoice_number, total_price) VALUES (1, 'INV-0001', 129);`);
  await assertRejected(
    `INSERT INTO invoices (order_id, invoice_number, total_price) VALUES (2, 'INV-0001', 10)`,
    'invoices_invoice_number_key',
  );
});

test('the delivery list shows each ordered product and whether it was delivered', async () => {
  await addDeliveredOrder();
  const { rows } = await db.query(
    `SELECT delivery_id, customer_id, product_id, quantity, total_price, delivery_address, completed FROM delivery_list`,
  );
  assert.deepEqual(
    rows.map((row) => ({ ...row, total_price: Number(row.total_price) })),
    [
      {
        delivery_id: 1,
        customer_id: 1,
        product_id: 1,
        quantity: 1,
        total_price: 129,
        delivery_address: 'Istanbul',
        completed: true,
      },
    ],
  );
});

test('cancelled orders are left out of the delivery list', async () => {
  await addDeliveredOrder();
  await db.exec(`UPDATE orders SET status = 'cancelled' WHERE id = 1`);
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM delivery_list`);
  assert.equal(rows[0].n, 0);
});

test('the delivery list view obeys row level security', async () => {
  const { rows } = await db.query(
    `SELECT reloptions FROM pg_class WHERE relname = 'delivery_list'`,
  );
  assert.ok(rows[0].reloptions.includes('security_invoker=true'));
});

// Requirement 16: returns

test('a return request starts open and records its refund amount', async () => {
  await addDeliveredOrder();
  await db.exec(
    `INSERT INTO return_requests (order_item_id, user_id, quantity, reason, refund_amount) VALUES (1, 1, 1, 'Wrong condition', 129.00)`,
  );
  const { rows } = await db.query(`SELECT status, reviewed_at, refund_amount FROM return_requests`);
  assert.deepEqual(rows.map((row) => ({ ...row, refund_amount: Number(row.refund_amount) })), [
    { status: 'requested', reviewed_at: null, refund_amount: 129 },
  ]);
});

test('a return request needs at least one card', async () => {
  await addDeliveredOrder();
  await assertRejected(
    `INSERT INTO return_requests (order_item_id, user_id, quantity, refund_amount) VALUES (1, 1, 0, 0)`,
    'return_requests_quantity_check',
  );
});

test('a refund cannot be negative', async () => {
  await addDeliveredOrder();
  await assertRejected(
    `INSERT INTO return_requests (order_item_id, user_id, quantity, refund_amount) VALUES (1, 1, 1, -5)`,
    'return_requests_refund_amount_check',
  );
});

test('an approved return records when the sales manager decided', async () => {
  await addDeliveredOrder();
  await db.exec(
    `INSERT INTO return_requests (order_item_id, user_id, quantity, refund_amount) VALUES (1, 1, 1, 129.00)`,
  );
  await assertRejected(
    `UPDATE return_requests SET status = 'approved' WHERE id = 1`,
    'return_requests_review_check',
  );
  await db.exec(
    `UPDATE return_requests SET status = 'approved', reviewed_by = 2, reviewed_at = now() WHERE id = 1`,
  );
});

test('an open return request has no reviewer', async () => {
  await addDeliveredOrder();
  await assertRejected(
    `INSERT INTO return_requests (order_item_id, user_id, quantity, refund_amount, reviewed_by) VALUES (1, 1, 1, 129.00, 2)`,
    'return_requests_review_check',
  );
});

test('a return status must be one of the known values', async () => {
  await addDeliveredOrder();
  await assert.rejects(
    db.exec(
      `INSERT INTO return_requests (order_item_id, user_id, quantity, refund_amount, status) VALUES (1, 1, 1, 129.00, 'refunded')`,
    ),
    /invalid input value for enum return_status/,
  );
});

// Requirements 11 and 14: wish list

test('a card is on a wish list at most once', async () => {
  await db.exec(`INSERT INTO wish_list_items (user_id, product_id) VALUES (1, 1)`);
  await assertRejected(
    `INSERT INTO wish_list_items (user_id, product_id) VALUES (1, 1)`,
    'wish_list_items_pkey',
  );
});

test('deleting a user also clears their wish list', async () => {
  await db.exec(`INSERT INTO wish_list_items (user_id, product_id) VALUES (1, 1)`);
  await db.exec(`DELETE FROM users WHERE id = 1`);
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM wish_list_items`);
  assert.equal(rows[0].n, 0);
});

// Requirement 11: discounts

test('a card has no discount unless one is set', async () => {
  const { rows } = await db.query(`SELECT discount_percent FROM products WHERE id = 1`);
  assert.equal(rows[0].discount_percent, 0);
});

test('a discount is between 0 and 90 percent', async () => {
  await db.exec(`UPDATE products SET discount_percent = 90 WHERE id = 1`);
  await assertRejected(`UPDATE products SET discount_percent = 91 WHERE id = 1`, 'products_discount_percent_check');
  await assertRejected(`UPDATE products SET discount_percent = -5 WHERE id = 1`, 'products_discount_percent_check');
});

// Requirement 13: support chat

async function addSupportAgent() {
  await db.exec(
    `INSERT INTO users (name, email, password_hash, role, updated_at) VALUES ('Joy', 'joy@example.com', 'hash', 'support_agent', now())`,
  );
  return 3;
}

test('a guest chat waits in the queue until an agent claims it', async () => {
  const agent = await addSupportAgent();
  await db.exec(
    `INSERT INTO support_conversations (guest_token, guest_name, updated_at) VALUES ('guest-123', 'Misty', now())`,
  );
  const { rows } = await db.query(`SELECT status, agent_id FROM support_conversations`);
  assert.deepEqual(rows, [{ status: 'waiting', agent_id: null }]);
  await db.exec(
    `UPDATE support_conversations SET status = 'active', agent_id = ${agent}, claimed_at = now() WHERE id = 1`,
  );
});

test('a chat belongs to a customer or a guest', async () => {
  await assertRejected(
    `INSERT INTO support_conversations (updated_at) VALUES (now())`,
    'support_conversations_owner_check',
  );
});

test('an active chat must have been claimed', async () => {
  await db.exec(`INSERT INTO support_conversations (customer_id, updated_at) VALUES (1, now())`);
  await assertRejected(
    `UPDATE support_conversations SET status = 'active' WHERE id = 1`,
    'support_conversations_claim_check',
  );
});

test('a waiting chat has no agent', async () => {
  const agent = await addSupportAgent();
  await assertRejected(
    `INSERT INTO support_conversations (customer_id, agent_id, updated_at) VALUES (1, ${agent}, now())`,
    'support_conversations_claim_check',
  );
});

test('a closed chat records when it was closed', async () => {
  const agent = await addSupportAgent();
  await db.exec(
    `INSERT INTO support_conversations (customer_id, status, agent_id, claimed_at, updated_at) VALUES (1, 'active', ${agent}, now(), now())`,
  );
  await assertRejected(
    `UPDATE support_conversations SET status = 'closed' WHERE id = 1`,
    'support_conversations_closed_check',
  );
  await db.exec(`UPDATE support_conversations SET status = 'closed', closed_at = now() WHERE id = 1`);
});

test('a chat message cannot be blank text', async () => {
  await db.exec(`INSERT INTO support_conversations (customer_id, updated_at) VALUES (1, now())`);
  await assertRejected(
    `INSERT INTO support_messages (conversation_id, sender_type, sender_id, body) VALUES (1, 'customer', 1, '   ')`,
    'support_messages_body_check',
  );
  await db.exec(
    `INSERT INTO support_messages (conversation_id, sender_type, sender_id, body) VALUES (1, 'customer', 1, NULL)`,
  );
});

test('attachments are PDF, image or video files up to 25 MB', async () => {
  await db.exec(`
    INSERT INTO support_conversations (customer_id, updated_at) VALUES (1, now());
    INSERT INTO support_messages (conversation_id, sender_type, sender_id) VALUES (1, 'customer', 1);
    INSERT INTO support_attachments (message_id, file_name, mime_type, size_bytes, storage_path) VALUES
      (1, 'receipt.pdf', 'application/pdf', 1000, 'chat/1/receipt.pdf'),
      (1, 'card.jpg', 'image/jpeg', 2000, 'chat/1/card.jpg'),
      (1, 'unboxing.mp4', 'video/mp4', 26214400, 'chat/1/unboxing.mp4');
  `);
  await assertRejected(
    `INSERT INTO support_attachments (message_id, file_name, mime_type, size_bytes, storage_path) VALUES (1, 'run.exe', 'application/x-msdownload', 10, 'x')`,
    'support_attachments_mime_type_check',
  );
  await assertRejected(
    `INSERT INTO support_attachments (message_id, file_name, mime_type, size_bytes, storage_path) VALUES (1, 'big.mp4', 'video/mp4', 26214401, 'x')`,
    'support_attachments_size_bytes_check',
  );
});

test('deleting a chat removes its messages and attachments', async () => {
  await db.exec(`
    INSERT INTO support_conversations (customer_id, updated_at) VALUES (1, now());
    INSERT INTO support_messages (conversation_id, sender_type, sender_id, body) VALUES (1, 'customer', 1, 'Hi');
    INSERT INTO support_attachments (message_id, file_name, mime_type, size_bytes, storage_path) VALUES (1, 'a.png', 'image/png', 10, 'x');
    DELETE FROM support_conversations WHERE id = 1;
  `);
  const { rows } = await db.query(
    `SELECT (SELECT count(*) FROM support_messages)::int AS m, (SELECT count(*) FROM support_attachments)::int AS a`,
  );
  assert.deepEqual(rows, [{ m: 0, a: 0 }]);
});
