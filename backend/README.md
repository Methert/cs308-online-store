# Backend

Node.js backend for the CS 308 online store. The database is Supabase (PostgreSQL), accessed through [Prisma](https://www.prisma.io) 7.

## Database setup

1. Install dependencies:

   ```bash
   cd backend
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in both connection strings from Supabase: **Project Settings → Database → Connection string**. Ask Ahmet for the password; never commit `.env`.

3. Apply the migrations and generate the Prisma client:

   ```bash
   npm run db:migrate
   npm run db:generate
   ```

## Schema changes

The schema is in [prisma/schema.prisma](prisma/schema.prisma) and is owned by Ahmet. To request a change, open an issue.

- Never edit a migration that has already been applied; add a new one with `npm run db:migrate:dev -- --name <change>`.
- Rules Prisma cannot express, such as `CHECK` constraints and row level security, are written by hand at the end of the migration SQL.
- Every new table gets `ENABLE ROW LEVEL SECURITY` so Supabase's public API cannot reach it.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run db:migrate` | Applies pending migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Creates and applies a new migration on the dev database |
| `npm run db:generate` | Generates the Prisma client into `generated/prisma` |
| `npm run db:studio` | Opens Prisma Studio to browse the data |
