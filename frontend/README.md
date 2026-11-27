# Peko Cards frontend

React and Vite storefront. Run commands from the repository root:

```sh
npm --prefix frontend ci
npm run dev:frontend
```

Open <http://127.0.0.1:8765>. Start the existing backend using [its setup guide](../backend/README.md). The frontend requires the API and a seeded database for normal use. It shows request errors and retry buttons when the API is unavailable.

```sh
npm run test:frontend
npm run build:frontend
```

Vite forwards `/api` and `/images` to `http://127.0.0.1:3000`. To use a different local API, set `VITE_API_PROXY_TARGET` in the environment before starting Vite. For deployment, serve those paths on the same origin or set `VITE_API_URL` to the API origin at build time and allow the frontend origin in the backend's CORS configuration. See [.env.example](.env.example). No secret belongs in a `VITE_` variable.

## Sprint 5 integration

- **Accounts:** Sign in and sign up call `/api/auth/login` and `/api/auth/register`. Registration includes name, email, password, tax ID and home address, matching the current validator. The token is kept in sessionStorage and `/api/auth/me` verifies it after refresh. Passwords, tax IDs and addresses are not cached in browser storage. Sign-out clears the session. A 401 on a protected request expires the session; a temporary account-check outage offers a retry and retains the token.
- **Bag:** The server stores both guest and account bags. A UUID in localStorage identifies a guest via `x-guest-token`. Adds, quantity changes and removals wait for server confirmation and reload the server bag. Sign-in and registration call `/api/cart/merge`, then load the account bag. The guest token is cleared only after a successful merge; failure preserves it and offers a retry. Startup shares one merge promise, and browsers with Web Locks serialize merges for the same guest identity across tabs. Other tabs refresh the bag on change notifications or focus.
- **Merge quantities:** The current backend adds quantities from both bags. The frontend displays that result without capping or replacing it. If a quantity exceeds stock, the bag explains the conflict and withholds checkout until the customer reduces it. Bag mutations are limited to the API's 99-copy maximum. The backend remains responsible for stock validation and transaction concurrency.
- **Reviews:** Card details load `/api/products/:id` and `/api/reviews/product/:id`. Average ratings include submitted ratings; only approved comments are public. Logged-in customers load their delivered purchases from `/api/orders` and submit the actual `orderItemId` to `/api/reviews`. Comments remain hidden until approved. The current order response does not expose whether each item was reviewed already, so duplicate submissions are reported using the API's 409 response. A successful submission updates the public summary without inventing a locally approved comment.
- **Request states:** Catalog, card detail, accounts, bag, orders and reviews show distinct loading, error and empty states. Retry controls recover failed reads. Failed writes do not show success, silently clear items, or substitute sample products. Late responses for an older account or card are ignored.

Checkout now submits to the existing `/api/orders` endpoint and reads the resulting order history from the API. This keeps it consistent with the server bag: the frontend no longer clears the bag while saving a browser-only order. Payment is the backend's school-project simulation; use sample payment details only. Expiry and CVV are validated in the form but are not sent or stored. A connection loss during order submission tells the customer to check My orders before submitting again.

The staff inventory screen remains a browser-only preview from the earlier frontend work. It is restricted in the UI to a product-manager account and explicitly says it does not update server inventory. Connecting that management form to the product API is outside these four tasks.

Old browser-only demo account and bag records are not sent to the API: their product IDs and account IDs are unrelated to the seeded server records. Server guest and account bags survive refreshes independently of that earlier demo data.

## Local checks

After following the backend guide and running its seed:

1. Add a card as a guest and refresh. The quantity should remain.
2. Sign in with `customer@pokeshop.test` / `Customer123`. The display name becomes **Demo Customer**, and the guest bag is combined with the account bag.
3. Sign out. The account bag stays on the server and is not displayed to the guest. Add a guest card, then sign back in to check the merge into the existing account bag.
4. Open My orders. The seed includes delivered purchases that can be used to test ratings. Find one of those card variants in the shop and open its details. Submit a rating with an optional comment; the rating updates immediately and the comment waits for manager approval.
5. Create a customer using sample details, including a 10- or 11-digit sample tax ID. Refresh and verify the returned display name and bag.
6. Stop the API and refresh the shop. Check loading and error messages, then restart it and use the retry controls.

Tests use HTTP fixtures in `src/test/api-fixture.js` that match the checked-in API response shapes. These fixtures are only imported by tests. The running app always calls the configured API.
