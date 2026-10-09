/**
 * Database client.
 *
 * Prefers the Docker PostgreSQL from ADR-028 (DATABASE_URL). When that is not
 * available, falls back to PGlite — real PostgreSQL compiled to WebAssembly, running
 * in-process. That keeps the app fully functional before Docker is configured, and it
 * is the same schema and the same SQL either way.
 */
import { existsSync } from "node:fs";
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

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Where the migration SQL lives. Normally it sits beside this module in
 * packages/db — but a serverless bundle is a single file somewhere else, so
 * the candidates also cover an explicit MIGRATIONS_DIR and the copy
 * `includeFiles` places under the deployment root. The first candidate that
 * actually holds the drizzle journal wins; a miss falls back to the module
 * location, where `readdir` produces the honest error.
 */
function migrationsDir(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    join(MODULE_DIR, "..", "migrations"),
    join(process.cwd(), "packages", "db", "migrations"),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(join(candidate, "meta", "_journal.json"))) return candidate;
  }
  return join(MODULE_DIR, "..", "migrations");
}

/** Migration files as ordered [name, sql] pairs. */
async function migrationEntries(): Promise<[string, string][]> {
  const dir = migrationsDir();
  const names = (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort();
  const out: [string, string][] = [];
  for (const name of names) out.push([name, await readFile(join(dir, name), "utf8")]);
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
        // A cold connection to a hosted database measures ~4.5s here (DNS, TLS,
        // pooler handshake), so a 5s budget made the *first* attempt fail often
        // enough that the process quietly started on the built-in database
        // instead — the same app, a second place for its data. ADR-028's fallback
        // is for a database that is genuinely not there, not for a slow one.
        connect_timeout: 15,
        onnotice: () => {},
      });

      // Retry the probe before accepting "unavailable": a hosted database drops a
      // first connection now and then (`read ECONNRESET`), and one dropped
      // connection must not decide where the day's study data lands.
      let probeError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await client`select 1`;
          probeError = null;
          break;
        } catch (err) {
          probeError = err;
          if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
      if (probeError) {
        await client.end({ timeout: 2 }).catch(() => undefined);
        throw probeError;
      }

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
        `[db] PostgreSQL at ${maskUrl(databaseUrl)} is unavailable, falling back to PGlite. Data written from now on goes to the local built-in database, NOT to ${maskUrl(databaseUrl)}.`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // A serverless host (Vercel, Netlify) has no durable local disk: PGlite
  // would start empty on every cold start and every note written here would
  // evaporate with the instance. Both ways of arriving at this line — no
  // DATABASE_URL at all, or one that failed to connect — end here, because a
  // loud boot failure beats a working app that quietly loses study data.
  if (process.env.VERCEL === "1" || process.env.NETLIFY === "true") {
    throw new Error(
      databaseUrl
        ? `PostgreSQL at ${maskUrl(databaseUrl)} is unreachable on this serverless deployment, and the in-process PGlite fallback cannot be used here — set or fix DATABASE_URL.`
        : "DATABASE_URL is not set, and the in-process PGlite database cannot be used on this serverless deployment — set DATABASE_URL to a pooled PostgreSQL connection string.",
    );
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
    // `exec` answers with one Results per statement in the batch, not a row
    // object. Reading `.rows` off the array always yielded [], which made the
    // migration skip-check believe nothing had ever run and re-apply every file
    // on every boot — harmless until 0010, the first migration whose DDL is not
    // idempotent, and whose "multiple primary keys" error is not an
    // "already exists" the loop is willing to swallow.
    const results = await pglite.exec(q);
    const last = results[results.length - 1];
    return { rows: (last?.rows ?? []) as never[] };
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
