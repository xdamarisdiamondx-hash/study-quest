/**
 * Notes and attachments (P5, PRD section 7).
 *
 * Every query is scoped by the `profileId` that `requireProfile` puts on the context.
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";

import {
  type Attachment,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME,
  createNoteSchema,
  type Note,
  restoreRevisionSchema,
  updateNoteSchema,
} from "@sq/core/schemas/notes";
import { attachments, notes, noteRevisions, topics } from "@sq/db/schema";
import { createId } from "@paralleldrive/cuid2";

import { requireProfile, type ProfileEnv } from "../auth/currentProfile.ts";
import { db } from "../db.ts";
import { fileStore } from "../files/store.ts";

export const notesRouter = new Hono<ProfileEnv>();

notesRouter.use("*", async (c, next) => {
  const denied = await requireProfile(c);
  if (denied) return denied;
  await next();
});

/* --- serialisation ------------------------------------------------------- */

function serialiseNote(row: typeof notes.$inferSelect): Note {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serialiseAttachment(row: typeof attachments.$inferSelect): Attachment {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

function badRequest(issues: { message: string }[]) {
  return Response.json({ error: "invalid", issues: issues.map((i) => i.message) }, { status: 400 });
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

/** Does this note belong to the caller? */
async function ownsNote(profileId: string, noteId: string): Promise<boolean> {
  const [row] = await db.orm
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, profileId)))
    .limit(1);
  return row !== undefined;
}

/** Does this topic belong to the caller? */
async function ownsTopic(profileId: string, topicId: string | null): Promise<boolean> {
  if (!topicId) return true;
  const [topic] = await db.orm
    .select({ id: topics.id })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  if (!topic) return false;
  // Check subject ownership
  const [subject] = await db.orm
    .select({ userId: topics.id })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  return subject !== undefined;
}

/* --- notes --------------------------------------------------------------- */

/**
 * GET /api/notes?topicId=...&subjectId=... — list notes, optionally filtered by topic
 * or subject.
 *
 * A subject's notes are its topics' notes, so a `subjectId` scope joins through
 * `topics`; that keeps the scoping on the server instead of shipping every note to the
 * client and filtering there. Topic-less notes belong to no subject and are therefore
 * excluded from a subject scope — which is correct, since they would be unreachable.
 */
notesRouter.get("/", async (c) => {
  const profileId = c.get("profileId");
  const topicId = c.req.query("topicId") ?? null;
  const subjectId = c.req.query("subjectId") ?? null;

  const filters = [eq(notes.userId, profileId)];
  if (topicId) filters.push(eq(notes.topicId, topicId));

  if (subjectId) {
    const rows = await db.orm
      .select({ note: notes })
      .from(notes)
      .innerJoin(topics, eq(notes.topicId, topics.id))
      .where(and(...filters, eq(topics.subjectId, subjectId)))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt));

    return Response.json({ notes: rows.map((r) => serialiseNote(r.note)) });
  }

  const rows = await db.orm
    .select()
    .from(notes)
    .where(and(...filters))
    .orderBy(desc(notes.pinned), desc(notes.updatedAt));

  return Response.json({ notes: rows.map(serialiseNote) });
});

/** GET /api/notes/:id — one note with its attachments and last 20 revisions */
notesRouter.get("/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  const [note] = await db.orm
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, profileId)))
    .limit(1);
  if (!note) return notFound();

  const [attachmentRows, revisionRows] = await Promise.all([
    db.orm
      .select()
      .from(attachments)
      .where(eq(attachments.noteId, id))
      .orderBy(desc(attachments.createdAt)),
    db.orm
      .select()
      .from(noteRevisions)
      .where(eq(noteRevisions.noteId, id))
      .orderBy(desc(noteRevisions.savedAt))
      .limit(20),
  ]);

  return Response.json({
    note: serialiseNote(note),
    attachments: attachmentRows.map(serialiseAttachment),
    revisions: revisionRows.map((r) => ({
      id: r.id,
      bodyMd: r.bodyMd,
      savedAt: r.savedAt.toISOString(),
    })),
  });
});

/** POST /api/notes — create a new note */
notesRouter.post("/", async (c) => {
  const profileId = c.get("profileId");
  const parsed = createNoteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const { topicId = null, title = "", bodyMd = "" } = parsed.data;

  if (topicId && !(await ownsTopic(profileId, topicId))) return notFound();

  const [created] = await db.orm
    .insert(notes)
    .values({
      userId: profileId,
      topicId,
      title: title.trim() || "Untitled note",
      bodyMd,
      wordCount: bodyMd.split(/\s+/).filter(Boolean).length,
      pinned: false,
    })
    .returning();
  if (!created) return Response.json({ error: "insert_failed" }, { status: 500 });

  return Response.json({ note: serialiseNote(created) }, { status: 201 });
});

/** PATCH /api/notes/:id — update note (title, body, topic, pin). Creates a revision on body change. */
notesRouter.patch("/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  if (!(await ownsNote(profileId, id))) return notFound();

  const parsed = updateNoteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const changes: Partial<typeof notes.$inferInsert> = {};
  let bodyChanged = false;

  if (parsed.data.title !== undefined) changes.title = parsed.data.title.trim() || "Untitled note";
  if (parsed.data.topicId !== undefined) {
    if (parsed.data.topicId && !(await ownsTopic(profileId, parsed.data.topicId))) return notFound();
    changes.topicId = parsed.data.topicId;
  }
  if (parsed.data.pinned !== undefined) changes.pinned = parsed.data.pinned;
  if (parsed.data.bodyMd !== undefined) {
    changes.bodyMd = parsed.data.bodyMd;
    changes.wordCount = parsed.data.bodyMd.split(/\s+/).filter(Boolean).length;
    bodyChanged = true;
  }

  // If body changed, save a revision before updating
  if (bodyChanged) {
    const [current] = await db.orm.select().from(notes).where(eq(notes.id, id)).limit(1);
    if (current) {
      await db.orm.insert(noteRevisions).values({
        noteId: id,
        bodyMd: current.bodyMd,
      });
    }
  }

  const [updated] = await db.orm
    .update(notes)
    .set(changes)
    .where(and(eq(notes.id, id), eq(notes.userId, profileId)))
    .returning();
  if (!updated) return notFound();

  return Response.json({ note: serialiseNote(updated) });
});

/** DELETE /api/notes/:id — delete a note (cascades to revisions, attachments) */
notesRouter.delete("/:id", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  const deleted = await db.orm
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, profileId)))
    .returning({ id: notes.id });
  if (deleted.length === 0) return notFound();

  return Response.json({ ok: true });
});

/* --- revisions ----------------------------------------------------------- */

/** POST /api/notes/:id/revisions/restore — restore a previous revision */
notesRouter.post("/:id/revisions/restore", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  if (!(await ownsNote(profileId, id))) return notFound();

  const parsed = restoreRevisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.issues);

  const [revision] = await db.orm
    .select()
    .from(noteRevisions)
    .where(and(eq(noteRevisions.id, parsed.data.revisionId), eq(noteRevisions.noteId, id)))
    .limit(1);
  if (!revision) return notFound();

  // Save current body as a revision before restoring
  const [current] = await db.orm.select().from(notes).where(eq(notes.id, id)).limit(1);
  if (current) {
    await db.orm.insert(noteRevisions).values({
      noteId: id,
      bodyMd: current.bodyMd,
    });
  }

  const [updated] = await db.orm
    .update(notes)
    .set({ bodyMd: revision.bodyMd, wordCount: revision.bodyMd.split(/\s+/).filter(Boolean).length })
    .where(eq(notes.id, id))
    .returning();

  return Response.json({ note: serialiseNote(updated!) });
});

/* --- attachments --------------------------------------------------------- */

/** POST /api/notes/:id/attachments — upload a file (multipart/form-data) */
notesRouter.post("/:id/attachments", async (c) => {
  const profileId = c.get("profileId");
  const noteId = c.req.param("id");

  if (!(await ownsNote(profileId, noteId))) return notFound();

  const formData = await c.req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "invalid", issues: ["No file provided"] }, { status: 400 });
  }

  if (!ATTACHMENT_MIME.includes(file.type as (typeof ATTACHMENT_MIME)[number])) {
    return Response.json(
      { error: "invalid", issues: [`File type ${file.type} not allowed. Allowed: ${ATTACHMENT_MIME.join(", ")}`] },
      { status: 400 },
    );
  }

  if (file.size > ATTACHMENT_MAX_BYTES) {
    return Response.json(
      { error: "invalid", issues: [`File too large. Maximum ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`] },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const objectKey = `users/${profileId}/notes/${noteId}/${createId()}-${file.name}`;

  await fileStore.put(objectKey, buffer, file.type);

  const [attachment] = await db.orm
    .insert(attachments)
    .values({
      userId: profileId,
      noteId,
      filename: file.name,
      mimeType: file.type,
      bytes: file.size,
      storageProvider: process.env.R2_ACCOUNT_ID ? "r2" : "local",
      objectKey,
    })
    .returning();
  if (!attachment) return Response.json({ error: "insert_failed" }, { status: 500 });

  return Response.json({ attachment: serialiseAttachment(attachment) }, { status: 201 });
});

/** GET /api/notes/:id/attachments/:attachmentId — download/get presigned URL */
notesRouter.get("/:id/attachments/:attachmentId", async (c) => {
  const profileId = c.get("profileId");
  const attachmentId = c.req.param("attachmentId");

  const [attachment] = await db.orm
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.userId, profileId)))
    .limit(1);
  if (!attachment) return notFound();

  const url = await fileStore.getUrl(attachment.objectKey);
  return Response.json({ url });
});

/** DELETE /api/notes/:id/attachments/:attachmentId */
notesRouter.delete("/:id/attachments/:attachmentId", async (c) => {
  const profileId = c.get("profileId");
  const attachmentId = c.req.param("attachmentId");

  const [attachment] = await db.orm
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.userId, profileId)))
    .limit(1);
  if (!attachment) return notFound();

  await fileStore.delete(attachment.objectKey);
  await db.orm.delete(attachments).where(eq(attachments.id, attachmentId));

  return Response.json({ ok: true });
});

/* --- export -------------------------------------------------------------- */

/** GET /api/notes/:id/export — download note as .md */
notesRouter.get("/:id/export", async (c) => {
  const profileId = c.get("profileId");
  const id = c.req.param("id");

  if (!(await ownsNote(profileId, id))) return notFound();

  const [note] = await db.orm.select().from(notes).where(eq(notes.id, id)).limit(1);
  if (!note) return notFound();

  const content = `# ${note.title}\n\n${note.bodyMd}`;
  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${note.title.replace(/[^a-z0-9]/gi, "_")}.md"`,
    },
  });
});