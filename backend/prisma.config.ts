import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrations) uses the direct or session-pooler connection.
// The running app connects separately with DATABASE_URL through @prisma/adapter-pg.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // process.env instead of env() so `prisma generate` works without a database configured.
    url: process.env.DIRECT_URL,
  },
});
