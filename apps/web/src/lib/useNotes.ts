/**
 * Notes state (P5).
 *
 * TanStack Query for server state, local state for the editor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notesApi, aiApi, type CreateNote, type UpdateNote, type NotesScope } from "./notesApi";
import type { Note, Attachment } from "@sq/core/schemas/notes";

export type { Note, Attachment, NotesScope };

/** Query keys for TanStack Query. The scope is part of the key so subject, topic and
 *  unfiltered lists cache independently and invalidate together under `all`. */
export const notesKeys = {
  all: ["notes"] as const,
  list: (scope: NotesScope) => ["notes", "list", scope.subjectId ?? null, scope.topicId ?? null] as const,
  detail: (id: string) => ["notes", "detail", id] as const,
};

/**
 * The write side of notes — mutations only, with no query attached.
 *
 * Split out so the editor can create, edit and run AI on a note without also fetching a
 * note list it never renders. Unscoped that list was every note in the account, on every
 * editor open.
 */
export function useNoteActions() {
  const queryClient = useQueryClient();

  const createNote = useMutation({
    mutationFn: (input: CreateNote) => notesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  const updateNote = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNote }) => notesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) => notesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  const restoreRevision = useMutation({
    mutationFn: ({ noteId, revisionId }: { noteId: string; revisionId: string }) =>
      notesApi.restoreRevision(noteId, { revisionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: ({ noteId, file, onProgress }: { noteId: string; file: File; onProgress?: (pct: number) => void }) =>
      notesApi.uploadAttachment(noteId, file, onProgress),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: ({ noteId, attachmentId }: { noteId: string; attachmentId: string }) =>
      notesApi.deleteAttachment(noteId, attachmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  // AI actions
  const quiz = useMutation({
    mutationFn: ({
      noteId,
      questionCount = 10,
      difficulty = "mixed",
      types = ["mcq"],
    }: { noteId: string; questionCount?: number; difficulty?: "easy" | "medium" | "hard" | "mixed"; types?: ("mcq" | "true_false")[] }) =>
      aiApi.quiz(noteId, questionCount, difficulty, types),
  });

  const flashcards = useMutation({
    mutationFn: ({ noteId, cardCount = 15 }: { noteId: string; cardCount?: number }) =>
      aiApi.flashcards(noteId, cardCount),
  });

  return {
    createNote,
    updateNote,
    deleteNote,
    restoreRevision,
    uploadAttachment,
    deleteAttachment,
    quiz,
    flashcards,
  };
}

export function useNotes(scope: NotesScope = {}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: notesKeys.list(scope),
    queryFn: () => notesApi.list(scope),
  });

  return {
    notes: data?.notes ?? [],
    isLoading,
    error: error?.message ?? null,
    refetch,
    ...useNoteActions(),
  };
}

export function useNoteDetail(noteId: string | undefined) {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: notesKeys.detail(noteId ?? ""),
    queryFn: () => notesApi.detail(noteId!),
    enabled: !!noteId,
  });

  const updateNote = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNote }) => notesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });

  return {
    note: data?.note ?? null,
    attachments: data?.attachments ?? [],
    revisions: data?.revisions ?? [],
    isLoading,
    error: error?.message ?? null,
    refetch,
    updateNote,
  };
}

/**
 * Autosave hook for the note editor.
 *
 * Debounces body/title changes and calls updateNote.
 */
export function useAutosave(
  noteId: string,
  updateNote: (id: string, input: UpdateNote) => Promise<unknown>,
  enabled = true,
) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | number>(null);
  const lastSavedRef = useRef<{ title: string; bodyMd: string } | null>(null);

  const save = useCallback(
    (title: string, bodyMd: string) => {
      if (!enabled) return;
      const _key = `${title}|${bodyMd}`;
      if (lastSavedRef.current && lastSavedRef.current.title === title && lastSavedRef.current.bodyMd === bodyMd) {
        return; // no changes
      }
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
      setStatus("saving");
      timeoutRef.current = setTimeout(async () => {
        try {
          await updateNote(noteId, { title, bodyMd });
          lastSavedRef.current = { title, bodyMd };
          setStatus("saved");
          setTimeout(() => setStatus("idle"), 2000);
        } catch {
          setStatus("error");
        }
      }, 1500);
    },
    [noteId, updateNote, enabled],
  );

  // Cancel pending autosave on unmount
  useEffect(() => () => {
    if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
  }, []);

  return { status, save };
}

/** Hook for reading note aloud with sentence highlighting */
export function useReadAloud(sentences: string[]) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    if (currentIndex >= sentences.length) return;

    const utterance = new SpeechSynthesisUtterance(sentences[currentIndex]);
    utteranceRef.current = utterance;

    utterance.onend = () => {
      if (currentIndex + 1 < sentences.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setIsPlaying(false);
        setCurrentIndex(-1);
      }
    };
    utterance.onerror = () => setIsPlaying(false);

    window.speechSynthesis.speak(utterance);
  }, [currentIndex, sentences]);

  const play = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    if (isPlaying) return;
    setIsPlaying(true);
    if (currentIndex === -1) setCurrentIndex(0);
    speak();
  }, [isPlaying, currentIndex, speak]);

  const pause = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.pause();
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentIndex(-1);
  }, []);

  const next = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (currentIndex + 1 < sentences.length) {
      setCurrentIndex((i) => i + 1);
      speak();
    }
  }, [currentIndex, sentences, speak]);

  const previous = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      speak();
    }
  }, [currentIndex, speak]);

  return { currentIndex, isPlaying, play, pause, stop, next, previous };
}