/**
 * Export, import and the zip format behind both (P21 data portability).
 *
 * One JSON file carries every table — `data.json` — because the app runs on
 * two engines (Docker Postgres and in-process PGlite, ADR-028): JSON dumps
 * round-trip on both, where `pg_dump` would only work on one. Rows are keyed
 * by their real SQL table names, so the file is readable with `jq` too.
 *
 * Restore is **replace, not merge** (the same rule A.8 gave onboarding):
 * `TRUNCATE … CASCADE` inside one transaction, then insert in `EXPORT_ORDER`,
 * parents before children. A failed restore rolls back to exactly the state
 * the app was in — never half-imported. Every table in the schema must appear
 * in the order list or the dump refuses to be written (and the test fails), so
 * a table added later cannot be silently left out of every student's backup.
 *
 * `search_index` is restored with ON CONFLICT DO NOTHING: rebuilding its
 * triggers fire as the entity rows go in, so the freshly computed rows win and
 * the dump's copy is belt and braces.
 */
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable, PgTimestamp } from "drizzle-orm/pg-core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type { Db } from "@sq/db/client";
import * as schema from "@sq/db/schema";

import { DATA_ROOT } from "../files/store.ts";

/** Bumped when the shape of data.json changes; older files are refused. */
export const EXPORT_FORMAT = 1;

type SchemaKey = keyof typeof schema;

/**
 * Insert order for a restore: a parent is always listed before its children
 * (and catalogues before anything that references them). Referential actions
 * are immediate, so this list is what makes the load legal — it is checked
 * against the real schema by `schemaTableNames` in the tests.
 */
export const EXPORT_ORDER: SchemaKey[] = [
  // better-auth's own tables (users.authUserId hangs off `user`)
  "user",
  "session",
  "account",
  "verification",
  // the app profile every row belongs to
  "users",
  // reference catalogues (no outbound keys)
  "levels",
  "achievements",
  // content tree
  "subjects",
  "topics",
  "notes",
  "noteRevisions",
  "attachments",
  "aiArtifacts",
  "quizzes",
  "quizQuestions",
  "quizAttempts",
  "questionMastery",
  "flashcardDecks",
  "flashcards",
  "flashcardReviews",
  "tasks",
  "taskRecurrences",
  "plans",
  "planBlocks",
  "studySessions",
  "sessionSteps",
  "quests",
  "questSteps",
  // gamification
  "xpLedger",
  "userAchievements",
  "streaks",
  // engagement and history
  "recommendationDismissals",
  "reminders",
  "reminderSettings",
  "activityLog",
  "recentSearches",
  // derived — rebuilt by triggers while the rows above load
  "searchIndex",
];

export interface DbDump {
  meta: { app: "study-quest"; format: number; exportedAt: string };
  tables: Record<string, unknown[]>;
}

function tableFor(key: SchemaKey): PgTable {
  const value: unknown = schema[key];
  if (!is(value, PgTable)) throw new Error(`export: ${key} is not a table`);
  return value;
}

/** Every table the schema actually declares, keyed by SQL name. */
function allTables(): Map<string, PgTable> {
  const map = new Map<string, PgTable>();
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) map.set(getTableName(value), value);
  }
  return map;
}

/** SQL names of every table in the schema, sorted — the test's oracle. */
export function schemaTableNames(): string[] {
  return [...allTables().keys()].sort();
}

/** SQL names in `EXPORT_ORDER` — the other half of the completeness check. */
export function exportTableNames(): string[] {
  return EXPORT_ORDER.map((key) => getTableName(tableFor(key)));
}

/** Read every table, in restore order. */
export async function dumpDatabase(db: Db): Promise<DbDump> {
  const known = allTables();
  const ordered = new Set(EXPORT_ORDER.map((key) => getTableName(tableFor(key))));
  const missing = [...known.keys()].filter((name) => !ordered.has(name));
  if (missing.length > 0) {
    throw new Error(`export order is missing table(s): ${missing.join(", ")}`);
  }

  const tables: Record<string, unknown[]> = {};
  for (const key of EXPORT_ORDER) {
    const table = tableFor(key);
    tables[getTableName(table)] = await db.orm.select().from(table);
  }
  return {
    meta: { app: "study-quest", format: EXPORT_FORMAT, exportedAt: new Date().toISOString() },
    tables,
  };
}

/** Reject anything that is not a complete, honest dump — before it touches SQL. */
export function validateDump(dump: unknown): asserts dump is DbDump {
  const d = dump as DbDump | null;
  if (!d || typeof d !== "object" || !d.meta || typeof d.meta !== "object") {
    throw new Error("data.json is not a Study Quest export");
  }
  if (d.meta.app !== "study-quest") throw new Error("data.json is not a Study Quest export");
  if (d.meta.format !== EXPORT_FORMAT) {
    throw new Error(`unsupported export format ${String(d.meta.format)} (this app writes ${EXPORT_FORMAT})`);
  }
  if (!d.tables || typeof d.tables !== "object" || Array.isArray(d.tables)) {
    throw new Error("data.json has no tables object");
  }

  const known = allTables();
  for (const [name, rows] of Object.entries(d.tables)) {
    // Whitelist: table names are looked up in the schema, never passed through.
    if (!known.has(name)) throw new Error(`data.json contains an unknown table: ${name}`);
    if (!Array.isArray(rows)) throw new Error(`data.json table ${name} is not an array`);
    for (const row of rows) {
      if (typeof row !== "object" || row === null || Array.isArray(row)) {
        throw new Error(`data.json table ${name} contains a non-object row`);
      }
    }
  }

  // A missing table would truncate to empty and never be refilled.
  const absent = [...known.keys()].filter((name) => !(name in d.tables));
  if (absent.length > 0) throw new Error(`data.json is missing table(s): ${absent.join(", ")}`);
}

/** Postgres caps a statement at 65535 bind parameters — chunk well under it. */
const MAX_PARAMS = 60_000;

type Tx = Parameters<Parameters<Db["orm"]["transaction"]>[0]>[0];

/**
 * JSON writes a Date as an ISO string; drizzle's timestamp columns want a
 * Date back or `mapToDriverValue` throws on `.toISOString`. Only genuine
 * timestamp columns are touched — a note whose *text* happens to look like a
 * timestamp stays text.
 */
function reviveTimestamps(
  table: PgTable,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const stampCols = Object.entries(getTableColumns(table))
    .filter(([, column]) => is(column, PgTimestamp))
    .map(([name]) => name);
  if (stampCols.length === 0) return rows;

  return rows.map((row) => {
    let revived: Record<string, unknown> | null = null;
    for (const name of stampCols) {
      const value = row[name];
      if (typeof value === "string") {
        revived ??= { ...row };
        revived[name] = new Date(value);
      }
    }
    return revived ?? row;
  });
}

async function insertChunked(
  tx: Tx,
  table: PgTable,
  rows: Record<string, unknown>[],
  skipConflicts: boolean,
): Promise<void> {
  const revived = reviveTimestamps(table, rows);
  const columns = Math.max(1, Object.keys(revived[0] ?? {}).length);
  const per = Math.max(1, Math.floor(MAX_PARAMS / columns));
  for (let i = 0; i < revived.length; i += per) {
    const chunk = revived.slice(i, i + per) as never[];
    const query = tx.insert(table).values(chunk);
    await (skipConflicts ? query.onConflictDoNothing() : query);
  }
}

/**
 * Replace the database with `dump`, atomically.
 *
 * Returns the row count per table — the route echoes it back so the UI (and
 * the student) can see what came home.
 */
export async function restoreDatabase(db: Db, dump: unknown): Promise<Record<string, number>> {
  validateDump(dump);

  const counts: Record<string, number> = {};
  await db.orm.transaction(async (tx) => {
    // Whitelisted names straight from the schema — quoted so `user` (a
    // reserved word) and friends survive the round trip as identifiers.
    const list = [...allTables().keys()].map((name) => `"${name}"`).join(", ");
    await tx.execute(sql.raw(`truncate ${list} cascade`));

    for (const key of EXPORT_ORDER) {
      const table = tableFor(key);
      const name = getTableName(table);
      const rows = (dump.tables[name] ?? []) as Record<string, unknown>[];
      counts[name] = rows.length;
      if (rows.length === 0) continue;
      // search_index rows were already rebuilt by the entity triggers above.
      await insertChunked(tx, table, rows, name === "search_index");
    }
  });
  return counts;
}

/* --- the zip ------------------------------------------------------------ */

export const DATA_JSON = "data.json";
export const README_TXT = "README.txt";
export const CONFIG_TEMPLATE = "config.template.json";
export const FILES_PREFIX = "files/";

const EXPORT_README = `Study Quest export
==================

data.json            every table of the app, one JSON object per table name.
                     Restores through Settings -> Data -> Import this file;
                     it REPLACES whatever is in the app now.
files/               attachment bytes (present when the app stores files on
                     local disk). Restored alongside the rows.
config.template.json a starting config.local.json. The PIN is not included on
                     purpose — after a restore, set it again in Settings.

To restore: open Study Quest, Settings, "Import this file", choose this zip.
The import replaces all data with the contents of data.json, and rolls back
completely if anything does not fit.

Notes
-----
* If the app is configured for R2 storage (see ADR-027), attachment bytes live
  in the bucket, not on disk — this export carries the rows and the README only
  when files are kept in R2; download them from the bucket separately.
* This file may contain personal study data. Move it like you would move your
  diary.
`;

const CONFIG_EXAMPLE = {
  note: "Copy to config.local.json next to package.json. LAN and PIN are managed from Settings — this file is written by the app when you turn LAN on.",
  enabled: false,
};

export interface ExportFile {
  /** Path relative to the local file root, always with "/" separators. */
  path: string;
  bytes: Uint8Array;
}

export function makeExportZip(input: { dump: DbDump; files?: ExportFile[] }): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    [DATA_JSON]: strToU8(JSON.stringify(input.dump)),
    [README_TXT]: strToU8(EXPORT_README),
    [CONFIG_TEMPLATE]: strToU8(`${JSON.stringify(CONFIG_EXAMPLE, null, 2)}\n`),
  };
  for (const file of input.files ?? []) {
    entries[FILES_PREFIX + file.path] = file.bytes;
  }
  return zipSync(entries, { level: 6 });
}

/**
 * A path from inside the zip, or an error: absolute paths, `..` segments and
 * NUL bytes are how a zip walks out of its target directory (zip-slip), so
 * they are refused before a single file is written.
 */
function safeRelPath(raw: string): string {
  const path = raw.replaceAll("\\", "/");
  if (path.startsWith("/") || path.includes("\0") || path.split("/").includes("..")) {
    throw new Error(`unsafe path inside zip: ${raw}`);
  }
  return path;
}

export function parseExportZip(bytes: Uint8Array): { dump: DbDump; files: ExportFile[] } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new Error("that file is not a readable zip");
  }

  const data = entries[DATA_JSON];
  if (!data) throw new Error("the zip has no data.json — not a Study Quest export");

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(data));
  } catch {
    throw new Error("data.json inside the zip is not valid JSON");
  }
  validateDump(parsed);

  const files: ExportFile[] = [];
  for (const [name, content] of Object.entries(entries)) {
    if (!name.startsWith(FILES_PREFIX) || name.endsWith("/")) continue;
    files.push({ path: safeRelPath(name.slice(FILES_PREFIX.length)), bytes: content });
  }
  return { dump: parsed, files };
}

/* --- bytes on disk ------------------------------------------------------- */

/** Walk the local file store; R2 is a bucket, not a directory (ADR-027). */
function collectLocalFiles(): ExportFile[] {
  if (process.env.R2_ACCOUNT_ID || !existsSync(DATA_ROOT)) return [];
  const out: ExportFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push({ path: relative(DATA_ROOT, full).replaceAll("\\", "/"), bytes: new Uint8Array(readFileSync(full)) });
    }
  };
  walk(DATA_ROOT);
  return out;
}

/**
 * The full archive the export button and the backup tick both write: dump +
 * attachment bytes + the README and config template. One builder, so a backup
 * is by construction restorable by an export.
 */
export async function buildExportZip(db: Db): Promise<Uint8Array> {
  const dump = await dumpDatabase(db);
  return makeExportZip({ dump, files: collectLocalFiles() });
}

/**
 * Unpack a zip's attachments into the local store. Skipped when the app runs
 * on R2 — those bytes belong in the bucket (README says so) — and additive by
 * design: files whose rows were removed before the export linger as orphans
 * rather than deleting anything a failed import might still need.
 */
export async function writeImportFiles(files: ExportFile[]): Promise<number> {
  if (process.env.R2_ACCOUNT_ID || files.length === 0) return 0;
  for (const file of files) {
    const full = join(DATA_ROOT, file.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.bytes);
  }
  return files.length;
}
