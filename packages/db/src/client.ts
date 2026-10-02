/**
 * Database client.
 *
 * Prefers the Docker PostgreSQL from ADR-028 (DATABASE_URL). When that is not
 * available, falls back to PGlite — real PostgreSQL compiled to WebAssembly, running
 * in-process. That keeps the app fully functional during M0 while Docker's WSL 2
 * backend is being set up, and it is the same SQL either way.
 */
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as schema from "./schema/index.ts";

export type Driver = "postgres" | "pglite";

export interface Db {
  driver: Driver;
  /** Drizzle query interface. */
  orm: import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema>;
  /** Executable SQL, used to apply migrations to PGlite. */
  sql: (query: string) => Promise<unknown>;
  close: () => Promise<void>;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Migration files as ordered [name, sql] pairs. */
async function migrationEntries(): Promise<[string, string][]> {
  const names = (await readdir(MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql")).sort();
  const out: [string, string][] = [];
  for (const name of names) out.push([name, await readFile(join(MIGRATIONS_DIR, name), "utf8")]);
  return out;
}

/**
 * Apply migrations that have not run yet.
 *
 * Tracks applied files by name in `_sq_migrations`, so restarting the server does not
 * re-run them. Each generated file is split on its statement breakpoints, because a
 * batch that fails part-way through is not resumable.
 */
async function migratePGlite(pglite: import("@electric-sql/pglite").PGlite): Promise<void> {
  await pglite.exec(
    `create table if not exists _sq_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     );`,
  );

  const applied = new Set(
    (await pglite.query<{ name: string }>("select name from _sq_migrations")).rows.map((r) => r.name),
  );

  for (const [name, sql] of await migrationEntries()) {
    if (applied.has(name)) continue;

    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed.length === 0) continue;
      try {
        await pglite.exec(trimmed);
      } catch (err) {
        // A dev database is often seeded by an earlier run and then the schema
        // changes. A statement that only fails because the object already exists
        // is not a reason to refuse to start; anything else is a real error.
        if (!/already exists/i.test(err instanceof Error ? err.message : "")) throw err;
      }
    }

    await pglite.exec(`insert into _sq_migrations (name) values ('${name}') on conflict do nothing;`);
    console.log(`[db] applied ${name}`);
  }
}

export async function createDb(databaseUrl = process.env.DATABASE_URL): Promise<Db> {
  if (databaseUrl) {
    try {
      const [{ drizzle }, postgres] = await Promise.all([
        import("drizzle-orm/postgres-js"),
        import("postgres"),
      ]);
      const sql = postgres(databaseUrl, { max: 5, connect_timeout: 5 });
      const orm = drizzle(sql, { schema });
      await sql`select 1`;
      return {
        driver: "postgres",
        orm,
        sql: async (q: string) => sql.unsafe(q),
        close: async () => sql.end({ timeout: 2 }),
      };
    } catch (err) {
      console.warn(
        `[db] PostgreSQL at ${maskUrl(databaseUrl)} is unavailable, falling back to PGlite.`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const { PGlite } = await import("@electric-sql/pglite");
  // Resolve to the repository root, not the app folder, so the database survives a
  // rebuild and sits next to the backup script (ADR-022).
  const dataDir =
    process.env.PGLITE_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "pgdata");
  await mkdir(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;
  const { drizzle } = await import("drizzle-orm/pglite");
  const orm = drizzle(pglite, { schema });
  await migratePGlite(pglite);

  return {
    driver: "pglite",
    orm,
    sql: async (q: string) => pglite.exec(q),
    close: async () => pglite.close(),
  };
}

/** Never log the password from a connection string. */
export function maskUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}
