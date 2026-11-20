# Backend

Node.js backend for the CS 308 online store. The database is Supabase (PostgreSQL), accessed through [Prisma](https://www.prisma.io) 7. The API uses Express 5.

Ready so far: project skeleton, database connection, authentication (`/api/auth/*`), role checks, cart and orders (`/api/cart`, `/api/orders`), products and categories (`/api/products`, `/api/categories`), 250+ unit tests.

## Requirements

- **Node.js 22.18 or newer** (24 LTS recommended). Prisma 7 generates its client as TypeScript, and Node runs it with built-in type stripping, which needs 22.18+.

## Getting started

### Option A: local database, no Supabase needed (recommended for daily work)

Open two terminals in `backend/`.

**Terminal 1: database** (keep it open)

```bash
npm install
npm run db:local   # starts a PostgreSQL inside this project; first start takes a while
```

**Terminal 2: API**

```bash
npm run setup      # creates .env with a random JWT_SECRET and the local database address
npm run db:migrate # creates the tables
npm run db:seed    # adds one demo account per role
npm run dev        # starts the API with auto-restart
```

Open <http://localhost:3000/api/health>. You should see `{ "data": { "status": "ok", "database": "up" } }`.

Next days you only need `npm run db:local` and `npm run dev`. After a `git pull` that adds migrations, run `npm run db:migrate` again.

Notes:

- Data lives in `backend/.local-db/` (ignored by git). To reset, stop the database and delete that folder.
- Every developer's local database is separate. Products or users you add are not visible to teammates.
- If the very first `prisma` command fails with `Command failed with UNKNOWN`, run it again. Windows sometimes blocks a freshly downloaded `.exe` once.

### Option B: Supabase (shared database)

1. Install dependencies and create the file: `npm install`, then `npm run setup`.
2. In `.env`, replace `DATABASE_URL` and `DIRECT_URL` with the two connection strings from Supabase: **Project Settings → Database → Connection string**. Ask Ahmet for the password; never commit `.env`.
3. Apply the migrations: `npm run db:migrate`. Then `npm run dev`.
4. If the app cannot connect and the error mentions SSL, add `DATABASE_SSL=true` to `.env`.

### Demo accounts (`npm run db:seed`)

| Role            | Email                    | Password      |
| --------------- | ------------------------ | ------------- |
| customer        | `customer@pokeshop.test` | `Customer123` |
| product_manager | `pm@pokeshop.test`       | `Manager123`  |
| sales_manager   | `sales@pokeshop.test`    | `Manager123`  |
| support_agent   | `support@pokeshop.test`  | `Support123`  |

Registration only creates **customers**. Staff accounts come from the seed script. Use these passwords for development only.

### Demo catalog (also `npm run db:seed`)

The seed also adds 3 card sets as categories (Base Set, 151, Crown Zenith) and 92 second-hand products: every card in near mint, valuable cards also in excellent condition, Base Set cards also as a played copy. 18 products are out of stock. Prices and stock are sample values; running the seed again updates them instead of adding duplicates.

- The card facts (names, numbers, rarities) are in `prisma/data/card-snapshot.json`, and one picture per card (61 WebP files, about 5 MB) is in `public/images/cards/<set>/<number>.webp`. Both come from [TCGdex](https://tcgdex.dev), an open, maintained Pokémon TCG database (MIT licensed data). To change the sets, edit `scripts/build-card-snapshot.js` and run `node scripts/build-card-snapshot.js`; it downloads the pictures again and keeps only cards that have one.
- Every product has a picture. `products.image_url` is a path such as `/images/cards/sv03.5/199.webp`, served by this API, so the frontend shows it as `<API address> + imageUrl` (for example `http://localhost:3000/images/cards/sv03.5/199.webp`). Nothing is loaded from other sites.
- The pictures belong to The Pokémon Company. They are in this private repository for the course demo only; pages that show them should say the site is a student project not affiliated with Nintendo or The Pokémon Company.

## Schema changes

The schema is in [prisma/schema.prisma](prisma/schema.prisma) and is owned by Ahmet. To request a change, open an issue.

- Never edit a migration that has already been applied; add a new one with `npm run db:migrate:dev -- --name <change>`.
- Rules Prisma cannot express, such as `CHECK` constraints and row level security, are written by hand at the end of the migration SQL.
- Every new table gets `ENABLE ROW LEVEL SECURITY` so Supabase's public API cannot reach it.
- Money columns use `Decimal`, never `Float`.
- For concurrent updates such as stock changes, use `prisma.$transaction` and a conditional update (for example `where: { id, stockQuantity: { gte: quantity } }`).

## Scripts

| Script                   | What it does                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| `npm run dev`            | Starts the API with auto-restart                                      |
| `npm start`              | Starts the API                                                        |
| `npm test`               | Runs all unit tests (no database needed)                              |
| `npm run test:coverage`  | Tests plus a coverage report                                          |
| `npm run test:db`        | Checks the database rules on an in-memory PostgreSQL (no setup)       |
| `npm run setup`          | Creates `.env` if it does not exist                                   |
| `npm run db:local`       | Starts the local development database                                 |
| `npm run db:migrate`     | Applies pending migrations (`prisma migrate deploy`)                  |
| `npm run db:migrate:dev` | Creates and applies a new migration on the dev database               |
| `npm run db:generate`    | Generates the Prisma client into `generated/prisma` (also on install) |
| `npm run db:seed`        | Creates or resets the demo accounts                                   |
| `npm run db:studio`      | Opens Prisma Studio to browse the data                                |
| `npm run format`         | Formats the code with Prettier (run before committing)                |

## Code layout

```
backend/
├─ prisma/            schema, migrations, seed.js
├─ scripts/           setup.js, dev-db.js
├─ src/
│  ├─ server.js       entry point: reads .env, connects to the database, starts the server
│  ├─ app.js          Express app: middleware and routes
│  ├─ config/         .env validation
│  ├─ constants/      role names
│  ├─ db/prisma.js    the single Prisma client
│  ├─ middleware/     authenticate, requireRole, validateBody, errorHandler
│  ├─ routes/         URLs; one module per file
│  ├─ services/       business rules (no HTTP code, easy to test)
│  ├─ repositories/   database queries
│  ├─ validators/     request rules (zod)
│  └─ utils/          AppError, tokenService
├─ tests/             Jest + Supertest
└─ api-examples.http  requests you can run from VS Code (REST Client extension)
```

A request flows like this:

```
request → route → (authenticate → requireRole → validateBody) → service → repository → PostgreSQL
                                                         error → errorHandler → { "error": "..." }
```

Services never touch the database directly; they use a repository. Tests give the service an in-memory fake repository (`tests/helpers/inMemoryUserRepository.js`), so unit tests run without a database.

## API conventions (everyone follows these)

Success: `{ "data": ... }`. Failure: `{ "error": "short message" }`. Validation errors also list the fields:

```json
{
  "error": "Validation failed",
  "details": [{ "field": "email", "message": "Email is not valid" }]
}
```

| Status | Meaning                                               |
| ------ | ----------------------------------------------------- |
| 200    | OK                                                    |
| 201    | Created                                               |
| 400    | Invalid data                                          |
| 401    | Not logged in, or the token is invalid or expired     |
| 403    | Logged in but not allowed                             |
| 404    | Not found                                             |
| 409    | Conflict (email already registered, not enough stock) |
| 413    | Request body too large                                |
| 429    | Too many attempts                                     |
| 500    | Server error (details only in the server log)         |

URLs are lowercase and plural (`/api/products`). JSON fields are camelCase. Roles and order statuses use the database values: `product_manager`, `processing`, `in_transit`, `delivered`.

## Authentication API

All URLs start with `/api`. The frontend stores the `token` and sends `Authorization: Bearer <token>` on every request that needs a login. On any `401`, delete the token and send the user to the login page.

### `POST /api/auth/register` creates a customer account

```json
{
  "name": "Ash Ketchum",
  "email": "ash@pokeshop.test",
  "password": "Pikachu123",
  "taxId": "12345678901",
  "homeAddress": "Pallet Town, Route 1, No: 5"
}
```

- `name`: 2–100 characters
- `email`: valid address; lowercased and trimmed
- `password`: at least 8 characters, at least one letter and one digit, at most 72 bytes (bcrypt limit)
- `taxId`: 10 (tax number) or 11 (national ID) digits
- `homeAddress`: 5–500 characters

A `role` in the body is ignored; the account is always a `customer`. Response **201**: `{ "data": { "user": { id, name, email, role, taxId, homeAddress, createdAt }, "token": "..." } }`. Errors: `400`, `409` (email taken), `429`.

### `POST /api/auth/login`

Body: `{ "email": "...", "password": "..." }`. Response **200**: same shape as register. A wrong email and a wrong password give the **same** answer: `401 "Invalid email or password"`.

### `GET /api/auth/me`

Header `Authorization: Bearer <token>`. Response **200**: `{ "data": { "user": { ... } } }` for the profile page (name, email, home address).

There is no logout endpoint: tokens are not stored on the server, so the frontend just deletes the token.

## Products and categories API

Each category is a card set (Base Set, 151, Crown Zenith). Reading needs no login; changes need a `product_manager` token.

| Method and URL                     | Who                     | What                                              |
| ---------------------------------- | ----------------------- | ------------------------------------------------- |
| `GET /api/products`                | everyone                | List, search, filter and sort products on sale    |
| `GET /api/products/:id`            | everyone                | Product detail                                    |
| `GET /api/categories`              | everyone                | Card sets, newest first, with `productCount`      |
| `GET /api/categories/:id`          | everyone                | One card set                                      |
| `GET /api/categories/:id/products` | everyone                | Products of one set (same options as the list)    |
| `GET /api/products/manage`         | product / sales manager | List with `cost`, `isActive` and removed products |
| `GET /api/products/manage/:id`     | product / sales manager | Detail with `cost` and `isActive`                 |
| `POST /api/products`               | product manager         | Add a product                                     |
| `PATCH /api/products/:id`          | product manager         | Change product fields (not the stock)             |
| `DELETE /api/products/:id`         | product manager         | Take a product off sale                           |
| `PATCH /api/products/:id/stock`    | product manager         | Set the stock or add/remove copies                |
| `POST /api/categories`             | product manager         | Add a card set                                    |
| `PATCH /api/categories/:id`        | product manager         | Change a card set                                 |
| `DELETE /api/categories/:id`       | product manager         | Delete a card set that has no products (`204`)    |

### List options (`GET /api/products`)

| Parameter    | Values                                                            | Default    |
| ------------ | ----------------------------------------------------------------- | ---------- |
| `q`          | Text searched in the name **or** the description, any letter case | none       |
| `categoryId` | A category id                                                     | all        |
| `sort`       | `name_asc`, `price_asc`, `price_desc`, `popularity`, `newest`     | `name_asc` |
| `page`       | 1, 2, ...                                                         | `1`        |
| `limit`      | 1–100 products per page                                           | `20`       |
| `status`     | Only on `/manage`: `active`, `inactive` or `all`                  | `active`   |

Example: `GET /api/products?q=charizard&sort=price_asc&page=1&limit=20`. An invalid value gives `400 "Invalid query parameters"` with `details`.

- **Popularity** is the number of copies sold in orders that were not cancelled (`soldCount` on every product).
- **Sold-out products stay in the list and in search** (requirement 7). Use `inStock` to disable "Add to cart".
- `%` and `_` in `q` are searched as normal characters.

Response:

```json
{
  "data": {
    "products": [
      {
        "id": 12,
        "name": "Charizard ex",
        "model": "199/165",
        "serialNumber": "SV03.5-199-NM",
        "description": "...",
        "rarity": "Special Illustration Rare",
        "condition": "near_mint",
        "price": 129.9,
        "stockQuantity": 3,
        "inStock": true,
        "warrantyStatus": "Authenticity guaranteed; condition as described",
        "distributor": "The Pokémon Company International",
        "imageUrl": "/images/cards/sv03.5/199.webp",
        "soldCount": 4,
        "category": { "id": 2, "name": "151", "setCode": "sv03.5", "series": "Scarlet & Violet" },
        "createdAt": "2026-11-20T13:34:03.688Z",
        "updatedAt": "2026-11-20T13:34:03.688Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 92, "totalPages": 5 }
  }
}
```

The detail endpoints answer `{ "data": { "product": { ... } } }`. Prices are numbers. `cost` and `isActive` are only in the `/manage` and product manager responses, never shown to customers. A removed product gives `404` on the public detail. An id that is not a positive whole number gives `400`.

### Product manager: adding and changing products

`POST /api/products`. Required fields: `categoryId`, `name`, `model`, `serialNumber`, `rarity`, `description`, `price`, `warrantyStatus`, `distributor`. Optional: `condition` (`mint`, `near_mint` (default), `excellent`, `good`, `played`, `poor`), `stockQuantity` (default 0), `cost` (empty means half of the price, requirement 11), `imageUrl` (`/images/...` or an `http(s)` address).

```json
{
  "categoryId": 2,
  "name": "Mew ex",
  "model": "193/165",
  "serialNumber": "SV03.5-193-NM",
  "rarity": "Ultra Rare",
  "description": "A full-art Mew ex.",
  "price": 19.9,
  "cost": 8,
  "stockQuantity": 5,
  "warrantyStatus": "Authenticity guaranteed; condition as described",
  "distributor": "The Pokémon Company International",
  "imageUrl": "/images/cards/sv03.5/193.webp"
}
```

Response **201** `{ "data": { "product": { ... } } }`. Errors: `400` (invalid field, unknown field, unknown category), `409` (serial number already used).

`PATCH /api/products/:id` takes any of the same fields (at least one), plus `isActive: true` to put a removed product back on sale. `cost: null` clears the cost. Stock is **not** accepted here.

`DELETE /api/products/:id` takes the product off sale: it disappears from the shop and from every cart, but the row stays because old orders and invoices point at it.

### Product manager: stock

`PATCH /api/products/:id/stock` with exactly one of:

- `{ "stockQuantity": 10 }` sets the stock to 10 (for example after counting).
- `{ "change": 5 }` adds 5 copies; `{ "change": -2 }` removes 2.

`change` is applied by the database in one statement (`stock_quantity = stock_quantity + change`), so it never overwrites a checkout happening at the same moment, and the stock can never go below 0. Removing more than there is gives `409 "Not enough stock: only 3 left, cannot remove 5"`.

### Product manager: categories

`POST /api/categories` with `name` (required), `description`, `setCode`, `series`, `releaseDate` (`YYYY-MM-DD`). `PATCH /api/categories/:id` takes the same fields (send `null` to clear one). A duplicate name or set code gives `409`. `DELETE` works only when no product uses the category, removed products included (`409` otherwise).

## Adding a module (cart, products, reviews, ...)

**1.** Create `src/routes/cart.routes.js`:

```js
const express = require('express');

function createCartRouter({ prisma, authenticate, optionalAuthenticate, requireRole, ROLES }) {
  const router = express.Router();

  // Guests may add to the cart (requirement 4), so login is optional here.
  // req.user is { id, role } when logged in and null for a guest.
  router.post('/items', optionalAuthenticate, async (req, res) => {
    res.status(201).json({ data: {} });
  });

  // Checkout needs a login.
  router.post('/checkout', authenticate, requireRole(ROLES.CUSTOMER), async (req, res) => {
    const userId = req.user.id;
    res.status(201).json({ data: {} });
  });

  return router;
}

module.exports = { createCartRouter };
```

**2.** Add one line to `src/app.js`, in the routes section: `app.use('/api/cart', createCartRouter(deps));`

Available helpers: `authenticate` (login required, sets `req.user`), `optionalAuthenticate` (guests allowed, `req.user = null`), `requireRole(...roles)` (always after `authenticate`), `validateBody(zodSchema)`, and `throw new AppError(409, 'Out of stock')`. Express 5 forwards errors from `async` routes automatically, so no `try/catch` is needed.

## Security notes (requirements 17 and 18)

| Measure                                                                                      | Where                                |
| -------------------------------------------------------------------------------------------- | ------------------------------------ |
| Passwords are hashed with bcrypt; the hash is never returned                                 | `services/auth.service.js`           |
| Nobody can register as staff: the role in the request is ignored                             | `validators/auth.schemas.js`         |
| Unknown email and wrong password look the same (no account enumeration)                      | `auth.service.js` → `login`          |
| 20 login/register attempts per IP per 15 minutes                                             | `routes/auth.routes.js`              |
| Tokens accept only `HS256`; tampered roles are rejected; the token holds only id and role    | `utils/tokenService.js`              |
| Roles are checked on the server for every protected route                                    | `middleware/requireRole.js`          |
| Parallel registrations with the same email: the database `UNIQUE` index stops the rest (409) | `repositories/user.repository.js`    |
| Internal error details are never sent to the client                                          | `middleware/errorHandler.js`         |
| Only product managers change products, stock and categories; customers never see the cost    | `routes/products.routes.js`          |
| Stock changes are atomic and cannot go below 0, even with parallel requests                  | `repositories/product.repository.js` |
| Invalid or too large ids give 400 before reaching the database                               | `validators/catalog.schemas.js`      |
| Security headers (helmet) and CORS limited to our frontend                                   | `app.js`                             |
| The server refuses to start with a missing or weak setting (`JWT_SECRET` < 32 chars)         | `config/env.js`                      |

Credit card data, invoices and other sensitive data are handled in later sprints.
