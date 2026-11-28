// Concurrent purchase check (requirement 18): several customers order the LAST copy of a card at
// the same moment through the real POST /api/orders route and a real PostgreSQL database.
// Exactly one order must succeed, the others must get 409, and stock must end at 0, not below.
//
//   CONCURRENCY_DATABASE_URL=postgres://... npm run test:concurrency
//
// It needs a throwaway PostgreSQL with all migrations applied (see "Concurrency check" in
// backend/README.md). Do not use `npx prisma dev`: it runs every connection through one PGlite
// session, so parallel requests get mixed up and the result says nothing about real PostgreSQL. It leaves its test users, card and orders behind, so it refuses to run
// against Supabase or any non-local host. It never reads DATABASE_URL, so it cannot touch the
// team database by accident.
require('dotenv').config();

const crypto = require('crypto');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config/env');
const { createPrismaClient } = require('../src/db/prisma');
const { createUserRepository } = require('../src/repositories/user.repository');
const { createTokenService } = require('../src/utils/tokenService');

const BUYERS = Number(process.env.CONCURRENCY_BUYERS) || 5;
const ROUNDS = Number(process.env.CONCURRENCY_ROUNDS) || 3;

function localUrl(url) {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function main() {
  const databaseUrl = process.env.CONCURRENCY_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Set CONCURRENCY_DATABASE_URL to a throwaway local database.');
  }
  if (!localUrl(databaseUrl)) {
    throw new Error(
      'CONCURRENCY_DATABASE_URL must point at localhost; this check leaves test data behind.',
    );
  }

  const config = loadConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
    CARD_HMAC_SECRET: process.env.CARD_HMAC_SECRET || crypto.randomBytes(32).toString('hex'),
  });
  const prisma = await createPrismaClient({ databaseUrl });
  const app = createApp({
    config,
    prisma,
    userRepository: createUserRepository(prisma),
    checkDatabase: () => prisma.$queryRaw`SELECT 1`,
    logger: { info() {}, warn() {}, error: (...args) => console.log('  server error:', ...args) },
  });
  const tokens = createTokenService(config.jwt);
  const run = crypto.randomBytes(4).toString('hex');

  // The invoice is made after the response; its errors (no SMTP here) are not part of this check.
  const consoleError = console.error;
  console.error = () => {};

  let failures = 0;
  try {
    const category = await prisma.category.create({ data: { name: `Concurrency ${run}` } });
    const buyers = [];
    for (let i = 0; i < BUYERS; i += 1) {
      buyers.push(
        await prisma.user.create({
          data: {
            name: `Buyer ${i}`,
            email: `buyer${i}-${run}@concurrency.test`,
            passwordHash: 'x',
          },
        }),
      );
    }

    for (let round = 1; round <= ROUNDS; round += 1) {
      const card = await prisma.product.create({
        data: {
          categoryId: category.id,
          name: `Last card ${round}`,
          model: '1/1',
          serialNumber: `CONC-${run}-${round}`,
          rarity: 'Rare',
          description: 'Concurrency check',
          stockQuantity: 1,
          price: 10,
          warrantyStatus: 'none',
          distributor: 'none',
        },
      });
      // Every buyer has the last copy in their cart.
      for (const buyer of buyers) {
        await prisma.cart.upsert({
          where: { userId: buyer.id },
          update: { items: { deleteMany: {}, create: { productId: card.id, quantity: 1 } } },
          create: { userId: buyer.id, items: { create: { productId: card.id, quantity: 1 } } },
        });
      }

      const responses = await Promise.all(
        buyers.map((buyer) =>
          request(app)
            .post('/api/orders')
            .set('Authorization', `Bearer ${tokens.sign({ id: buyer.id, role: 'customer' })}`)
            .send({
              deliveryAddress: 'Tuzla, Istanbul',
              paymentInfo: { cardHolder: buyer.name, cardNumber: '4242424242424242' },
            }),
        ),
      );

      const statuses = responses.map((res) => res.status).sort();
      for (const res of responses) {
        if (res.status !== 201 && res.status !== 409)
          console.log(`  unexpected ${res.status}: ${JSON.stringify(res.body)}`);
      }
      const won = statuses.filter((s) => s === 201).length;
      const lost = statuses.filter((s) => s === 409).length;
      const { stockQuantity } = await prisma.product.findUnique({ where: { id: card.id } });
      const orders = await prisma.orderItem.count({ where: { productId: card.id } });
      const ok = won === 1 && lost === BUYERS - 1 && stockQuantity === 0 && orders === 1;
      if (!ok) failures += 1;
      console.log(
        `${ok ? 'PASS' : 'FAIL'} round ${round}: ${BUYERS} buyers -> statuses ${statuses.join(',')}, stock ${stockQuantity}, orders ${orders}`,
      );
    }
  } finally {
    // Give the background invoice work a moment before the connection closes.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.error = consoleError;
    await prisma.$disconnect();
  }

  if (failures > 0) {
    console.error(`${failures} of ${ROUNDS} rounds sold the last card more or less than once.`);
    process.exitCode = 1;
  } else {
    console.log(`All ${ROUNDS} rounds sold the last card exactly once.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
