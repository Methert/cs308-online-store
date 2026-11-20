# CS 308 Online Store

Team project for CS 308 Software Engineering (Sabancı University, Fall 2026–2027): an online store web application built with Scrum.

## Team

| Member | GitHub | Scrum role | Area |
| --- | --- | --- | --- |
| Ahmet Ertekin | [@Methert](https://github.com/Methert) | Scrum Master, Product Owner | Team lead, database |
| Yavuz Baskurt | [@YavuzBaskurt](https://github.com/YavuzBaskurt) | Developer | Frontend |
| Emir Keskin | [@emirkeskin7](https://github.com/emirkeskin7) | Developer | Frontend |
| Berat Kumru | [@beratkumru](https://github.com/beratkumru) | Developer | Backend |
| Kerem Mescioglu | [@keremmescioglu-prog](https://github.com/keremmescioglu-prog) | Developer | Backend |
| Can Altay | [@canaltay24](https://github.com/canaltay24) | Developer | Fullstack |

Every member writes the backlog items for their own area; the Product Owner sets the final priority.

## Status

Record decisions here once the team agrees:

- **Store concept:** A shop that sells second-hand Pokémon trading cards. Every card shows the set (pack) it comes from, its rarity and its condition. Customers buy from the shop; they do not list cards themselves. Other product lines may be added later.
- **Language:** JavaScript
- **Backend:** [Node.js](https://nodejs.org)
- **Database:** [Supabase](https://supabase.com) (hosted PostgreSQL). Only the backend connects to it; tables come from migrations in this repository.
- **Frontend:** [React](https://react.dev)

## Getting started

```bash
git clone https://github.com/Methert/cs308-online-store.git
cd cs308-online-store
git switch dev
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first commit.

## Frontend

The storefront runs on React and Vite. From the repository root:

```bash
npm --prefix frontend ci
npm run dev:frontend
```

Open the local address printed by Vite. Use `npm run test:frontend` for the frontend tests and `npm run build:frontend` for a production build.

Sign in to the demo with `trainer@example.com` and `peko-demo`, or use Sign up to preview a chosen display name. Authentication currently simulates a session in the browser. The existing backend returns a public user's `name`, which the frontend uses for the account indicator.

The demo bag saves product IDs and quantities in localStorage and restores them against the current sample catalog. Existing bags and demo sessions from the reference version retain their storage keys. Reconciliation between a guest bag and an existing account bag is pending team instruction.

## Documents

- [Contribution rules](CONTRIBUTING.md): branches, commits, pull requests, bug reports
- [Requirements and grading](docs/REQUIREMENTS.md): feature checklist, sprint schedule, demo criteria
