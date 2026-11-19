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
