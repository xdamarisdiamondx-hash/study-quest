/**
 * Export/import round-trip (P21 exit criterion: "export/import round-trips
 * cleanly").
 *
 * The heavy test runs on a real PGlite with the real migrations in a temp
 * directory — the same engine the app falls back to — because the two things
 * that can silently break an export are FK order (a restore that refuses to
 * load) and trigger side effects (search_index rebuilt mid-restore). A mocked
 * database would prove neither.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@sq/db/client";
import { createDb } from "@sq/db/client";
import { notes, noteRevisions, subjects, topics, users } from "@sq/db/schema";
import { strToU8, zipSync } from "fflate";

import {
  EXPORT_ORDER,
  dumpDatabase,
  exportTableNames,
  makeExportZip,
  parseExportZip,
  restoreDatabase,
  schemaTableNames,
} from "./export.ts";

describe("export order", () => {
  it("covers every table in the schema — a new table cannot be left out of backups", () => {
    expect(exportTableNames().slice().sort()).toEqual(schemaTableNames());
  });

  it("lists no table twice", () => {
    expect(new Set(exportTableNames()).size).toBe(EXPORT_ORDER.length);
  });
});

describe("parseExportZip", () => {
  const emptyDump = () => ({
    meta: { app: "study-quest" as const, format: 1, exportedAt: new Date().toISOString() },
    tables: Object.fromEntries(schemaTableNames().map((name) => [name, []])),
  });

  it("round-trips a dump through zip bytes", () => {
    const zip = makeExportZip({ dump: emptyDump() });
    const { dump } = parseExportZip(zip);
    expect(dump.meta.app).toBe("study-quest");
    expect(Object.keys(dump.tables).sort()).toEqual(schemaTableNames());
  });

  it("refuses bytes that are not a zip", () => {
    expect(() => parseExportZip(new Uint8Array([1, 2, 3]))).toThrow(/zip/);
  });

  it("refuses a zip that is not ours", () => {
    const foreign = zipSync({ "README.txt": strToU8("hello") });
    expect(() => parseExportZip(foreign)).toThrow(/data\.json/);
  });

  it("refuses a dump claiming a table the schema does not have", () => {
    const dump = emptyDump() as unknown as { tables: Record<string, unknown[]> };
    dump.tables["drop_everything"] = [];
    const zip = makeExportZip({ dump: dump as never });
    expect(() => parseExportZip(zip)).toThrow(/unknown table/);
  });
});

describe("round-trip on a real database", () => {
  let db: Db;
  let dir: string;
  let seeded: { userId: string; subjectId: string; topicId: string; noteId: string };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "sq-export-"));
    process.env.PGLITE_DIR = dir;
    // "" is falsy: force the PGlite path even if a DATABASE_URL leaks in.
    db = await createDb("");

    const [user] = await db.orm
      .insert(users)
      .values({ displayName: "Round Trip" })
      .returning({ id: users.id });
    const [subject] = await db.orm
      .insert(subjects)
      .values({ userId: user!.id, name: "Physics", monogram: "Ph" })
      .returning({ id: subjects.id });
    const [topic] = await db.orm
      .insert(topics)
      .values({ subjectId: subject!.id, name: "Motion" })
      .returning({ id: topics.id });
    const [note] = await db.orm
      .insert(notes)
      .values({ userId: user!.id, topicId: topic!.id, title: "Kinematics", bodyMd: "v = u + at" })
      .returning({ id: notes.id });
    await db.orm.insert(noteRevisions).values({ noteId: note!.id, bodyMd: "v = u + at" });
    seeded = { userId: user!.id, subjectId: subject!.id, topicId: topic!.id, noteId: note!.id };
  }, 60_000);

  afterAll(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("dump → zip → parse → restore reproduces the data and replaces everything else", async () => {
    const dump = await dumpDatabase(db);
    expect(dump.tables["subjects"]).toHaveLength(1);
    expect(dump.tables["notes"]).toHaveLength(1);

    // What the restore must erase: a row added after the export was taken.
    const [rogue] = await db.orm
      .insert(subjects)
      .values({ userId: seeded.userId, name: "Ghost", monogram: "Gh" })
      .returning({ id: subjects.id });

    const zip = makeExportZip({ dump });
    const parsed = parseExportZip(zip);
    const counts = await restoreDatabase(db, parsed.dump);

    expect(counts["subjects"]).toBe(1);
    expect(counts["notes"]).toBe(1);

    // Gone: the rogue row, per replace-not-merge.
    const subjectsNow = await dumpDatabase(db);
    expect(subjectsNow.tables["subjects"]).toHaveLength(1);
    expect(
      (subjectsNow.tables["subjects"] ?? []).some((r) => (r as { id: string }).id === rogue!.id),
    ).toBe(false);

    // Back: the whole picture, byte-for-byte as JSON sees it.
    expect(JSON.stringify(subjectsNow.tables)).toBe(JSON.stringify(dump.tables));

    // The chain is still linked: topic → subject, note → topic.
    const topicRow = topicsNowRow(subjectsNow.tables["topics"] ?? []);
    expect(topicRow.subjectId).toBe(seeded.subjectId);
    const noteRow = notesNowRow(subjectsNow.tables["notes"] ?? []);
    expect(noteRow.topicId).toBe(seeded.topicId);
    expect(noteRow.title).toBe("Kinematics");

    // And a second dump after restore equals the first — stable, idempotent.
    const again = await dumpDatabase(db);
    expect(JSON.stringify(again.tables)).toBe(JSON.stringify(dump.tables));
  }, 60_000);

  it("refuses a dump that is missing a table (it would truncate to empty)", async () => {
    const dump = await dumpDatabase(db);
    delete (dump.tables as Record<string, unknown[]>)["xp_ledger"];
    await expect(restoreDatabase(db, dump)).rejects.toThrow(/missing table/);
  });
});

function topicsNowRow(rows: unknown[]) {
  return rows[0] as { subjectId: string };
}
function notesNowRow(rows: unknown[]) {
  return rows[0] as { topicId: string; title: string };
}
