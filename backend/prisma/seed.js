// Creates the demo accounts and the demo card catalog:  npm run db:seed
// Registration only creates customers, so the manager and support accounts come from here.
// Running it again is safe (upsert): it does not break an existing account, it resets its
// password.
// WARNING: These passwords are for development and demos only.
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { createPrismaClient } = require('../src/db/prisma');
const { seedCatalog } = require('./seed-catalog');

const DEMO_USERS = [
  {
    name: 'Demo Customer',
    email: 'customer@pokeshop.test',
    role: 'customer',
    password: 'Customer123',
    taxId: '12345678901',
    homeAddress: 'Orta Mahalle, Universite Cd. No:27, Tuzla, Istanbul',
  },
  {
    name: 'Product Manager',
    email: 'pm@pokeshop.test',
    role: 'product_manager',
    password: 'Manager123',
  },
  {
    name: 'Sales Manager',
    email: 'sales@pokeshop.test',
    role: 'sales_manager',
    password: 'Manager123',
  },
  {
    name: 'Support Agent',
    email: 'support@pokeshop.test',
    role: 'support_agent',
    password: 'Support123',
  },
];

async function main() {
  const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
  const prisma = await createPrismaClient({
    databaseUrl: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true',
  });

  try {
    for (const { password, ...user } of DEMO_USERS) {
      const passwordHash = await bcrypt.hash(password, rounds);
      await prisma.user.upsert({
        where: { email: user.email },
        update: { ...user, passwordHash },
        create: { ...user, passwordHash },
      });
      console.log(`  ✓ ${user.role.padEnd(16)} ${user.email} / ${password}`);
    }

    const catalog = await seedCatalog(prisma);
    console.log(
      `  ✓ catalog          ${catalog.categories} card sets, ${catalog.products} products`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => console.log('Seed completed.'))
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  });
