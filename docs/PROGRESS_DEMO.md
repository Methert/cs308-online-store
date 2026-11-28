# Progress Demo script

**When:** week 11, Friday 11 December 2026. **Rehearsal:** Friday 4 December, full run on the demo database.

Grades are individual, so everyone presents the part they built. Each block lists who talks, which requirement it proves, and the exact clicks. Target length: about 15 minutes, then questions.

## Before the demo (day before, Ahmet)

1. Supabase `demo` project: all migrations applied (`npm run db:migrate`), seed run (`npm run db:seed`). Running the seed again resets the demo accounts, the catalog prices and stock, and adds the four demo orders if they are missing.
2. On the demo laptop: `git pull` on `dev`, `npm install` in `backend` and `frontend`, `npm run setup` in `backend` (adds `CARD_HMAC_SECRET` if missing), `.env` pointing at the demo project.
3. Start both servers: `npm --prefix backend run dev` and `npm --prefix frontend run dev`; open http://127.0.0.1:8765.
4. Two browser windows side by side: a normal window for the customer, a private window for staff (separate sign-ins).
5. Check the run-through below once. If something fails, note it here and decide who fixes it.

### Demo accounts (from the seed)

| Role | Email | Password |
| --- | --- | --- |
| Customer | `customer@pokeshop.test` | `Customer123` |
| Product manager | `pm@pokeshop.test` | `Manager123` |
| Sales manager | `sales@pokeshop.test` | `Manager123` |
| Support agent | `support@pokeshop.test` | `Support123` |

The demo customer already has four orders: delivered 10 days ago (can be reviewed and returned), delivered 45 days ago (return window over), in transit, and processing (can be cancelled). Order numbers depend on the database, so refer to them by status.

### Test cards (mock bank)

| Card number | Result |
| --- | --- |
| `4242 4242 4242 4242` | approved |
| `4000 0000 0000 0002` | declined |
| `4000 0000 0000 9995` | insufficient funds |

## Run-through

| # | Who | Requirement | Time |
| --- | --- | --- | --- |
| 1 | Ahmet | 2 theme, 10 roles, stack, database | 2 min |
| 2 | Yavuz | 1 categories, 7 search and sort, out of stock | 2 min |
| 3 | Berat | 9 product fields, product API | 1.5 min |
| 4 | Yavuz | 4 guest bag kept after sign-in | 1.5 min |
| 5 | Emir, Kerem | 4 checkout, mock bank, invoice; 15 card entry | 2.5 min |
| 6 | Emir | 3 stock drops, order history; 14 cancel | 1.5 min |
| 7 | Berat, Emir | 3 and 12 delivery list, order status | 2 min |
| 8 | Can | 5 ratings and comment approval | 2 min |
| 9 | Ahmet, Can | 18 concurrent orders, tests and CI | 1.5 min |

### 1. Store and team (Ahmet)
- Second-hand Pokémon card shop: each product is one card in one condition; its set is the category, its number in the set is the model, its rarity and condition are shown.
- Stack: React (Vite), Node.js and Express, PostgreSQL on Supabase with Prisma. Four roles: customer, product manager, sales manager, support agent.
- Database: rules the database itself enforces (stock never below zero, one review per purchase, discounts 0–90 %, row level security on every table).

### 2. Browsing (Yavuz) — requirements 1, 7
- Shop page without signing in: 92 cards with pictures, set, number, condition.
- Rarity filter, then search `charizard`; tick "Include descriptions" and search a word from a description.
- Sort by price low to high, then by popularity.
- Show a sold-out card: it is still in the results, its button says sold out and cannot be clicked.

### 3. Product fields (Berat) — requirement 9
- Open a card's details: name, model (card number), serial number, description, stock, price, warranty, distributor.
- Mention that the same fields come from `GET /api/products/:id` and are validated on create and update.

### 4. Bag without an account (Yavuz) — requirement 4
- Signed out: add two cards to the bag.
- Sign in as the demo customer: the bag still has both cards.

### 5. Checkout (Emir, Kerem) — requirements 4, 15
- Go to checkout, fill the address and card form.
- Pay with `4000 0000 0000 0002`: payment declined, nothing charged, bag kept (Kerem: the bank decision is made on the server).
- Try another card, `4242 4242 4242 4242`: payment approved, the invoice is shown on screen.
- Kerem: the invoice PDF is generated and emailed when SMTP is set up; the card number is never stored, only the last four digits and an HMAC.

### 6. Stock and order history (Emir) — requirements 3, 14
- Back in the shop, the card's stock went down by the amount bought.
- My orders: the new order is "processing"; the demo orders show in transit and delivered.
- Cancel the processing demo order: it becomes cancelled and its stock comes back.

### 7. Delivery (Berat, Emir) — requirements 3, 12
- Staff window: sign in as the product manager, open the delivery list (delivery ID, customer ID, product ID, quantity, total, address, completed).
- Move the new order to "in transit", then "delivered".
- Customer window: refresh My orders, the status follows.

### 8. Reviews (Can) — requirement 5
- Customer: open a card from a delivered order, give 4 stars and a comment.
- The rating counts at once (average changes); the comment is not shown yet.
- Product manager: approve the comment on the comment approval screen. Customer: the comment now shows.
- Open a card the customer has not received: no review form.

### 9. Reliability (Ahmet, Can) — requirement 18
- Ahmet: `CONCURRENCY_BUYERS=10 npm run test:concurrency` (local Docker PostgreSQL, see `backend/README.md`; run it before the demo and show the output): ten customers buy the last copy at the same moment, exactly one order succeeds, stock ends at 0.
- Can: GitHub Actions runs all backend, database and frontend tests on every pull request; show the latest green run and the test count.

## If something goes wrong

- Supabase paused or unreachable: restore it from the dashboard (takes a few minutes), or run the backend against a local PostgreSQL in Docker (commands in `backend/README.md`, "Concurrency check") and seed it.
- Comment approval screen not merged in time: approve the comment with the request in `backend/api-examples.http` and say the screen is in progress.
- A step fails during the demo: say what should happen, move to the next step, do not debug live.

## Development activity (checked at the demo)

From the course document, per demo: 5 commits per member, 25 new unit test cases, 5 new bug reports, 30 sprint backlog items.

| Item | Status on 28 November |
| --- | --- |
| Commits | every member has at least 5 on `dev` |
| Unit tests | backend 452, database 48, frontend tests in CI, all passing |
| Bug reports | **0 on GitHub.** Open bugs found while testing as GitHub issues (bug template) before 10 December |
| Backlog items | Sprint 5 and Sprint 6 items in Jira |
