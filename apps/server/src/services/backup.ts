/**
 * Backups (P21): a dated zip in `data/backups/`, written by the app's own
 * scheduler, kept for two weeks.
 *
 * Why in-process rather than the plan's external `pg_dump` task: the database
 * this app runs on by default is PGlite, a Postgres that lives *inside* this
 * process — an outside task cannot dump it safely while it is running, and a
 * backup that needs the app closed is a backup nobody takes (ADR-017's rule:
 * the machine being off is the normal case). The server that owns the data is
 * the one that backs it up; `scripts/db-backup.ps1` covers the alternative
 * setup where Docker Postgres runs from `DATABASE_URL`.
 *
 * The zip is byte-for-byte what the Export button produces, so restoring a
 * backup is the ordinary import — one format, two doorways.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Db } from "@sq/db/client";

import { buildExportZip } from "./export.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, "..", "..", "..", "data", "backups");

/** How many dated zips to keep before the oldest is dropped. */
export const KEEP_BACKUPS = 14;

export interface BackupInfo {
  file: string;
  bytes: number;
  /** ISO mtime of the newest backup. */
  at: string;
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Newest `studyquest-*.zip`, or null on a fresh install. */
export function lastBackup(): BackupInfo | null {
  if (!existsSync(BACKUP_DIR)) return null;
  let newest: BackupInfo | null = null;
  for (const name of readdirSync(BACKUP_DIR)) {
    if (!/^studyquest-\d{8}-\d{6}\.zip$/.test(name)) continue;
    const stats = statSync(join(BACKUP_DIR, name));
    if (!newest || stats.mtimeMs > Date.parse(newest.at)) {
      newest = { file: name, bytes: stats.size, at: stats.mtime.toISOString() };
    }
  }
  return newest;
}

function prune(): void {
  const zips = readdirSync(BACKUP_DIR)
    .filter((name) => /^studyquest-\d{8}-\d{6}\.zip$/.test(name))
    .map((name) => ({ name, mtime: statSync(join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const stale of zips.slice(KEEP_BACKUPS)) {
    try {
      rmSync(join(BACKUP_DIR, stale.name));
    } catch {
      /* a locked file just means we try again next time */
    }
  }
}

/** Write one backup now; returns its info (or null if the dump failed). */
export async function backupNow(db: Db): Promise<BackupInfo> {
  const zip = await buildExportZip(db);
  mkdirSync(BACKUP_DIR, { recursive: true });
  const at = new Date();
  const file = `studyquest-${stamp(at)}.zip`;
  writeFileSync(join(BACKUP_DIR, file), zip);
  prune();
  return { file, bytes: zip.byteLength, at: at.toISOString() };
}

/** The scheduler's staleness rule: a day without a backup is worth fixing. */
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function backupIsStale(): boolean {
  const last = lastBackup();
  return !last || Date.now() - Date.parse(last.at) > BACKUP_INTERVAL_MS;
}
