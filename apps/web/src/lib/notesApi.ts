/**
 * Typed client for the notes API (P5).
 */
import type {
  Note,
  CreateNote,
  UpdateNote,
  Attachment,
  RestoreRevision,
} from "@sq/core/schemas/notes";

import { ApiError } from "./subjectsApi";

// Re-export types for consumers
export type { Note, CreateNote, UpdateNote, Attachment, RestoreRevision };

/** A note plus its attachments and revisions (detail view). */
export interface NoteDetail extends Note {
  attachments: Attachment[];
  revisions: { id: string; bodyMd: string; savedAt: string }[];
}

/**
 * What to list notes for. Both are optional and nest: a `topicId` narrows a `subjectId`
 * to one topic, and either alone is enough. With neither you get every note the caller owns.
 */
export interface NotesScope {
  topicId?: string;
  subjectId?: string;
}

export const notesApi = {
  /** GET /api/notes?topicId=...&subjectId=... */
  list: (scope: NotesScope = {}) => {
    const params = new URLSearchParams();
    if (scope.topicId) params.set("topicId", scope.topicId);
    if (scope.subjectId) params.set("subjectId", scope.subjectId);
    const query = params.toString();
    return fetch(query ? `/api/notes?${query}` : "/api/notes", { credentials: "same-origin" }).then(
      (r) => {
        if (!r.ok) throw new ApiError("Failed to load notes", r.status);
        return r.json() as Promise<{ notes: Note[] }>;
      },
    );
  },

  /** GET /api/notes/:id */
  detail: (id: string) =>
    fetch(`/api/notes/${encodeURIComponent(id)}`, { credentials: "same-origin" }).then((r) => {
      if (!r.ok) throw new ApiError("Failed to load note", r.status);
      return r.json() as Promise<{
        note: Note;
        attachments: Attachment[];
        revisions: { id: string; bodyMd: string; savedAt: string }[];
      }>;
    }),

  /** POST /api/notes */
  create: (input: CreateNote) =>
    fetch("/api/notes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => {
      if (!r.ok) throw new ApiError("Failed to create note", r.status);
      return r.json() as Promise<{ note: Note }>;
    }),

  /** PATCH /api/notes/:id */
  update: (id: string, input: UpdateNote) =>
    fetch(`/api/notes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => {
      if (!r.ok) throw new ApiError("Failed to update note", r.status);
      return r.json() as Promise<{ note: Note }>;
    }),

  /** DELETE /api/notes/:id */
  remove: (id: string) =>
    fetch(`/api/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    }).then((r) => {
      if (!r.ok) throw new ApiError("Failed to delete note", r.status);
      return r.json() as Promise<{ ok: true }>;
    }),

  /** POST /api/notes/:id/revisions/restore */
  restoreRevision: (id: string, input: RestoreRevision) =>
    fetch(`/api/notes/${encodeURIComponent(id)}/revisions/restore`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => {
      if (!r.ok) throw new ApiError("Failed to restore revision", r.status);
      return r.json() as Promise<{ note: Note }>;
    }),

  /** POST /api/notes/:id/attachments — multipart upload */
  uploadAttachment: (noteId: string, file: File, onProgress?: (pct: number) => void) => {
    const formData = new FormData();
    formData.append("file", file);

    return new Promise<{ attachment: Attachment }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/notes/${encodeURIComponent(noteId)}/attachments`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new ApiError("Upload failed", xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError("Upload failed", 0));
      xhr.send(formData);
    });
  },

  /** GET /api/notes/:id/attachments/:attachmentId — presigned URL */
  getAttachmentUrl: (noteId: string, attachmentId: string) =>
    fetch(
      `/api/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(attachmentId)}`,
      {
        credentials: "same-origin",
      },
    ).then((r) => {
      if (!r.ok) throw new ApiError("Failed to get attachment URL", r.status);
      return r.json() as Promise<{ url: string }>;
    }),

  /** DELETE /api/notes/:id/attachments/:attachmentId */
  deleteAttachment: (noteId: string, attachmentId: string) =>
    fetch(
      `/api/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(attachmentId)}`,
      {
        method: "DELETE",
        credentials: "same-origin",
      },
    ).then((r) => {
      if (!r.ok) throw new ApiError("Failed to delete attachment", r.status);
      return r.json() as Promise<{ ok: true }>;
    }),

  /** GET /api/notes/:id/export — download as .md */
  export: (id: string) =>
    fetch(`/api/notes/${encodeURIComponent(id)}/export`, { credentials: "same-origin" }).then(
      (r) => {
        if (!r.ok) throw new ApiError("Failed to export note", r.status);
        return r.blob();
      },
    ),
};
