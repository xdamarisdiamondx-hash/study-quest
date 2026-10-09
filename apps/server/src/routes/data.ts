/**
 * Data portability and backups (P21).
 *
 * Three endpoints, all session-gated by `requireProfile` and all behind the
 * LAN PIN when it is on (index.ts exempts only health/lan/me):
 *
 *   GET  /api/export   the same zip the scheduler writes, on demand
 *   POST /api/import   replace everything with a zip's contents
 *   GET  /api/backup   when the last scheduled backup landed
 *   POST /api/backup   write one now
 *
 * Import is the only route in the app allowed a body larger than the 12 MB
 * cap: an export carries every attachment, and refusing to restore a backup
 * because the backup is big would make the feature theatre.
 */
import { Hono } from "hono";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import { backupNow, lastBackup } from "../services/backup.ts";
import {
  buildExportZip,
  parseExportZip,
  restoreDatabase,
  writeImportFiles,
} from "../services/export.ts";

export const dataRouter = new Hono<ProfileEnv>();

function stampNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

dataRouter.get("/export", async (c) => {
  const denied = await requireProfile(c);
  if (denied) return denied;

  const zip = await buildExportZip(db);
  return new Response(zip, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="studyquest-${stampNow()}.zip"`,
      "cache-control": "no-store",
    },
  });
});

dataRouter.post("/import", async (c) => {
  const denied = await requireProfile(c);
  if (denied) return denied;

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return c.json({ error: "invalid", issues: ["No file provided"] }, 400);
  }

  let files;
  try {
    const parsed = parseExportZip(bytes);
    // Files first: they are additive, so if the transactional restore below
    // refuses the dump, the app still has exactly its old state (plus a few
    // harmless extra bytes on disk).
    const written = await writeImportFiles(parsed.files);
    files = { ...parsed, written };
  } catch (err) {
    return c.json(
      { error: "invalid", issues: [err instanceof Error ? err.message : "unreadable file"] },
      400,
    );
  }

  try {
    const counts = await restoreDatabase(db, files.dump);
    const rows = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return c.json({ ok: true, rows, tables: Object.keys(counts).length, files: files.written });
  } catch (err) {
    // The transaction has rolled back: the app is untouched.
    return c.json(
      {
        error: "restore_failed",
        message: err instanceof Error ? err.message : "restore failed — nothing was changed",
      },
      422,
    );
  }
});

dataRouter.get("/backup", async (c) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  return c.json({ last: lastBackup(), dir: "data/backups" });
});

dataRouter.post("/backup", async (c) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  try {
    return c.json({ last: await backupNow(db) });
  } catch (err) {
    return c.json(
      { error: "backup_failed", message: err instanceof Error ? err.message : "backup failed" },
      500,
    );
  }
});
