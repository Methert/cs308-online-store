// Local PostgreSQL for development: no need to INSTALL PostgreSQL on your computer.
//   npm run db:local     -> starts the database (it runs as long as this terminal stays open)
//   Ctrl+C               -> stops it (the data is kept in the .local-db/ folder, not deleted)
//
// .env must contain this address (npm run setup writes it for you):
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/pokemon_shop
//
// For development only. For the real/shared database, put the address of the PostgreSQL that
// Ahmet sets up (Supabase) into .env; this script is then not needed.
const path = require('path');
const fs = require('fs');

const PORT = 5433; // not 5432, so it does not clash with another PostgreSQL on this machine
const DATABASE = 'pokemon_shop';
const DATA_DIR = path.join(__dirname, '..', '.local-db');

async function main() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true, // do not delete the data when the database stops
    // On Turkish Windows the default locale makes initdb crash; "C" works everywhere.
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
  });

  const firstRun = !fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  if (firstRun) {
    console.log('First run: preparing the database (this happens only once)...');
    await pg.initialise();
  }

  await pg.start();

  try {
    await pg.createDatabase(DATABASE);
  } catch (err) {
    // It fails if the database already exists; that is fine.
    if (!/already exists/i.test(err.message)) throw err;
  }

  console.log(`PostgreSQL is ready: postgresql://postgres:postgres@localhost:${PORT}/${DATABASE}`);
  console.log('Press Ctrl+C to stop');

  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    console.log('\nShutting down the database...');
    await pg.stop();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  setInterval(() => {}, 1 << 30); // keep the process alive
}

main().catch((err) => {
  console.error('Could not start the local database:');
  console.error(err.message);
  if (/EADDRINUSE|address already in use/i.test(err.message)) {
    console.error(`Port ${PORT} is in use. The database may already be running.`);
  }
  process.exit(1);
});
