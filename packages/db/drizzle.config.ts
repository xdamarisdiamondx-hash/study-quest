import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated from the Drizzle schema and applied as plain SQL, so the
 * same files run against Docker PostgreSQL (ADR-028) and PGlite (the embedded
 * fallback used before Docker is available).
 *
 *   pnpm db:generate   regenerate SQL from the schema
 *   pnpm db:migrate    apply SQL to the local database
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  strict: true,
  verbose: true,
});
