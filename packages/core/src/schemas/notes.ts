/**
 * Note Zod contracts (P5, ADR-010).
 *
 * Shared between the server (route validation) and the web client (API types).
 */
import { z } from "zod";

export const noteSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  title: z.string(),
  bodyMd: z.string(),
  wordCount: z.number().int().nonnegative(),
  pinned: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Note = z.infer<typeof noteSchema>;

export const createNoteSchema = z.object({
  topicId: z.string().uuid().nullable().optional(),
  title: z.string().max(200).optional(),
  bodyMd: z.string().max(200_000).optional(),
});
export type CreateNote = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z
  .object({
    topicId: z.string().uuid().nullable().optional(),
    title: z.string().max(200).optional(),
    bodyMd: z.string().max(200_000).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdateNote = z.infer<typeof updateNoteSchema>;

export const noteRevisionSchema = z.object({
  id: z.string().uuid(),
  noteId: z.string().uuid(),
  bodyMd: z.string(),
  savedAt: z.string().datetime(),
});
export type NoteRevision = z.infer<typeof noteRevisionSchema>;

/**
 * File metadata (ADR-027). The bytes go to the `FileStore`; only the object key and the
 * facts a reader needs live here.
 */
export const attachmentSchema = z.object({
  id: z.string().uuid(),
  noteId: z.string().uuid().nullable(),
  filename: z.string(),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
  storageProvider: z.string(),
  createdAt: z.string().datetime(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** Upload limits, surfaced in the UI so the refusal is explained before it happens. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
] as const;

export const restoreRevisionSchema = z.object({
  /** The revision's content becomes the note body; the replaced body is kept as a revision. */
  revisionId: z.string().uuid(),
});
export type RestoreRevision = z.infer<typeof restoreRevisionSchema>;