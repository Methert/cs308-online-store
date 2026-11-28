// Does the first setup with one command:  npm run setup
// Creates .env if it does not exist (with a random JWT_SECRET, a random CARD_HMAC_SECRET and the
// local database address).
// If .env exists, it is left as it is, except that a missing CARD_HMAC_SECRET is added at the end
// (it became required in Sprint 5, so older .env files do not have it).
// If you use Supabase, replace DATABASE_URL and DIRECT_URL in .env with the addresses Ahmet
// gives you.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const examplePath = path.join(root, '.env.example');
const envPath = path.join(root, '.env');

const randomSecret = () => crypto.randomBytes(48).toString('hex');

if (fs.existsSync(envPath)) {
  const current = fs.readFileSync(envPath, 'utf8');
  if (/^CARD_HMAC_SECRET=\S+/m.test(current)) {
    console.log('.env already exists, left untouched.');
  } else {
    const eol = current.includes('\r\n') ? '\r\n' : '\n';
    const separator = current.endsWith('\n') ? '' : eol;
    fs.appendFileSync(
      envPath,
      `${separator}${eol}# Secret for HMAC-signing stored card numbers (req. 17)${eol}CARD_HMAC_SECRET=${randomSecret()}${eol}`,
    );
    console.log('.env already exists; added the missing CARD_HMAC_SECRET.');
  }
  process.exit(0);
}

const LOCAL_URL = 'postgresql://postgres:postgres@localhost:5433/pokemon_shop';

const content = fs
  .readFileSync(examplePath, 'utf8')
  .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomSecret()}`)
  .replace(/^CARD_HMAC_SECRET=.*$/m, `CARD_HMAC_SECRET=${randomSecret()}`)
  // Addresses for the local development database (npm run db:local)
  .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${LOCAL_URL}"`)
  .replace(/^DIRECT_URL=.*$/m, `DIRECT_URL="${LOCAL_URL}"`);

fs.writeFileSync(envPath, content, { encoding: 'utf8', flag: 'wx' });
console.log('.env created with random secrets and the local database address.');
