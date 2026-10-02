/**
 * Apply every migration to a real PostgreSQL, then report the table count.
 *
 * Used by CI to prove the schema applies cleanly, and useful locally when Docker is
 * running. Exits non-zero on any failure so CI stops.
 */
import { createDb } from "@sq/db/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = await createDb(databaseUrl);
console.log(`driver: ${db.driver}`);

const result = (await db.sql(
  `select count(*)::int as tables from information_schema.tables where table_schema = 'public'`,
)) as { rows: { tables: number }[] };

const count = result.rows[0]?.tables ?? 0;
console.log(`tables created: ${count}`);

await db.close();

// A working schema is well over 30 tables (section 18.1) plus the auth tables.
if (count < 30) {
  console.error(`expected at least 30 tables, found ${count}`);
  process.exit(1);
}
console.log("migrations applied cleanly");
