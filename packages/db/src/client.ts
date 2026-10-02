/**
 * Database client.
 *
 * Prefers the Docker PostgreSQL from ADR-028 (DATABASE_URL). When that is not
 * available, falls back to PGlite — real PostgreSQL compiled to WebAssembly, running
 * in-process. That keeps the app fully functional before Docker is configured, and it
 * is the same schema and the same SQL either way.
 */
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as schema from "./schema/index.ts";

export type Driver = "postgres" | "pglite";

/**
 * Drizzle's shared PostgreSQL base type.
 *
 * `PostgresJsDatabase` and `PgliteDatabase` are both concrete wrappers around the same
 * `PgDatabase`, so declaring the base type means callers get the real query builder for
 * either driver instead of a union the compiler cannot resolve method calls on.
 */
export type Orm = import("drizzle-orm/pg-core").PgDatabase<
  import("drizzle-orm/pg-core").PgQueryResultHKT,
  typeof schema
>;

export interface QueryResult {
  rows: Record<string, unknown>[];
}

export interface Db {
  driver: Driver;
  orm: Orm;
  /** Run raw SQL. Returns a uniform { rows } shape whichever driver is active. */
  sql: (query: string) => Promise<QueryResult>;
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
 * Apply every migration that has not run yet.
 *
 * Both drivers share this, so a schema change can never land on one and not the other.
 * Applied files are recorded in `_sq_migrations`, so restarting does not re-run them.
 * Each file is split on its statement breakpoints because a batch that fails part-way
 * through is not resumable.
 */
async function migrate(run: (sql: string) => Promise<unknown>): Promise<void> {
  await run(
    `create table if not exists _sq_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     );`,
  );

  const existing = (await run("select name from _sq_migrations")) as QueryResult;
  const applied = new Set(existing.rows.map((r) => String(r.name)));

  for (const [name, sql] of await migrationEntries()) {
    if (applied.has(name)) continue;

    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed.length === 0) continue;
      try {
        await run(trimmed);
      } catch (err) {
        // A dev database is often seeded by an earlier run and then the schema
        // changes. A statement that only fails because the object already exists
        // is not a reason to refuse to start; anything else is a real error.
        if (!/already exists/i.test(err instanceof Error ? err.message : "")) throw err;
      }
    }

    await run(`insert into _sq_migrations (name) values ('${name}') on conflict do nothing;`);
    console.log(`[db] applied ${name}`);
  }
}

export async function createDb(databaseUrl = process.env.DATABASE_URL): Promise<Db> {
  if (databaseUrl) {
    try {
      const [{ drizzle }, postgresModule] = await Promise.all([
        import("drizzle-orm/postgres-js"),
        import("postgres"),
      ]);
      const postgres = postgresModule.default;
      // `onnotice` is silenced on purpose: `create table if not exists` emits a NOTICE
      // on every start, and postgres-js raises it as an exception otherwise.
      const client = postgres(databaseUrl, {
        max: 5,
        connect_timeout: 5,
        onnotice: () => {},
      });
      await client`select 1`;

      // postgres-js `unsafe` already resolves to the rows array for a SELECT; for DDL it
      // resolves to an array of Result objects, which carry no rows. Normalise both.
      const run = async (q: string): Promise<QueryResult> => {
        const result: unknown = await client.unsafe(q);
        if (Array.isArray(result)) return { rows: result as never[] };
        return { rows: ((result as { rows?: unknown[] })?.rows ?? []) as never[] };
      };

      await migrate(run);

      return {
        driver: "postgres",
        orm: drizzle(client, { schema }),
        sql: run,
        close: async () => client.end({ timeout: 2 }),
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
    process.env.PGLITE_DIR ??
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "pgdata");
  await mkdir(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  const run = async (q: string): Promise<QueryResult> => {
    const result = await pglite.exec(q);
    return { rows: ((result as { rows?: unknown[] }).rows ?? []) as never[] };
  };

  await migrate(run);

  const { drizzle } = await import("drizzle-orm/pglite");
  return {
    driver: "pglite",
    orm: drizzle(pglite, { schema }),
    sql: run,
    close: async () => pglite.close(),
  };
}

/** Never log the password from a connection string. */
export function maskUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
}
