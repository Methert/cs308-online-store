// Does the first setup with one command:  npm run setup
// Creates .env if it does not exist (with a random JWT_SECRET and the local database address).
// If it exists, it is left untouched.
// If you use Supabase, replace DATABASE_URL and DIRECT_URL in .env with the addresses Ahmet
// gives you.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const examplePath = path.join(root, '.env.example');
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  console.log('.env already exists, left untouched.');
  process.exit(0);
}

const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5433/pokemon_shop';
const secret = crypto.randomBytes(48).toString('hex');

const content = fs
  .readFileSync(examplePath, 'utf8')
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
  // Addresses for the local development database (npm run db:local)
  .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${LOCAL_URL}"`)
  .replace(/^DIRECT_URL=.*$/m, `DIRECT_URL="${LOCAL_URL}"`);

fs.writeFileSync(envPath, content, { encoding: 'utf8', flag: 'wx' });
console.log('.env created with a random JWT_SECRET and the local database address.');
