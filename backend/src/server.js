// Entry point of the application:  npm run dev  (development)  /  npm start
// 1) reads and validates .env  2) connects to the database  3) starts the server
require('dotenv').config();

const { loadConfig } = require('./config/env');
const { createApp } = require('./app');
const { createPrismaClient } = require('./db/prisma');
const { createUserRepository } = require('./repositories/user.repository');

async function main() {
  // The settings are validated first, so a missing DATABASE_URL gives a clear error message.
  const config = loadConfig();

  const prisma = await createPrismaClient({
    databaseUrl: config.databaseUrl,
    ssl: config.databaseSsl,
  });
  await prisma.$connect();

  const app = createApp({
    config,
    prisma,
    userRepository: createUserRepository(prisma),
    checkDatabase: () => prisma.$queryRaw`SELECT 1`,
  });

  const server = app.listen(config.port, () => {
    console.log(`API is running on http://localhost:${config.port} (${config.env})`);
  });

  // Close open connections properly when stopping with Ctrl+C.
  async function shutdown(signal) {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start the server:');
  console.error(err.message);
  process.exit(1);
});
