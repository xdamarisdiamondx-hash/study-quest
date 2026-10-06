/**
 * Note editor (P5) — markdown with autosave, AI action bar, versions, attachments.
 */
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Input,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "@sq/ui";
import {
  plainText,
  wordCount,
  splitSentences,
  titleFromBody,
  cleanPasted,
} from "@sq/core/markdown";

import { notesApi, type CreateNote } from "../../lib/notesApi";
import { useNoteActions, useAutosave } from "../../lib/useNotes";
import { SummaryPanel } from "./SummaryPanel";
import { ExplainPanel } from "./ExplainPanel";
import { QuizPanel } from "../quiz/QuizPanel";
import { FlashcardPanel } from "../flashcards/FlashcardPanel";
import { ReadingTheatre } from "../reading/ReadingTheatre";

interface NoteEditorProps {
  /** Pre-selected topic ID (when creating from a topic page) */
  topicId?: string;
  /** Existing note ID (when editing) */
  noteId?: string;
  /** Called when the editor closes (new note created or cancelled) */
  onClose: () => void;
  /** Initial title/body for new notes */
  initialTitle?: string;
  initialBody?: string;
}

export function NoteEditor({
  topicId: propTopicId,
  noteId: propNoteId,
  onClose,
  initialTitle = "",
  initialBody = "",
}: NoteEditorProps) {
  const notes = useNoteActions();
  const [isNew] = useState(!propNoteId);
  const [title, setTitle] = useState(initialTitle);
  const [bodyMd, setBodyMd] = useState(initialBody);
  const [preview, setPreview] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [selectedText, setSelectedText] = useState("");
  /** Which AI panel, if any, has taken over the main area. */
  const [panel, setPanel] = useState<
    "summary" | "explain" | "quiz" | "flashcards" | "reading" | null
  >(null);
  /** The open note's topic — needed to file anything an AI panel saves. */
  const [noteTopicId, setNoteTopicId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { status: autosaveStatus, save: autosave } = useAutosave(
    propNoteId ?? "",
    (id, input) => notes.updateNote.mutateAsync({ id, input }),
    !isNew,
  );

  // Fetch existing note
  useEffect(() => {
    if (propNoteId && !isNew) {
      notesApi.detail(propNoteId).then((data) => {
        setTitle(data.note.title);
        setBodyMd(data.note.bodyMd);
        setNoteTopicId(data.note.topicId);
      });
    }
  }, [propNoteId, isNew]);

  // Autosave on changes
  useEffect(() => {
    if (!isNew && (title || bodyMd)) {
      autosave(title, bodyMd);
    }
  }, [title, bodyMd, autosave, isNew]);

  const wc = wordCount(bodyMd);

  const handleSave = async () => {
    if (isNew) {
      const input: CreateNote = {
        topicId: propTopicId ?? null,
        title: title.trim() || titleFromBody(bodyMd),
        bodyMd,
      };
      // Staying put is the point: createNote invalidates the list query, so closing
      // returns to a panel that already includes this note. Redirecting to the
      // standalone route used to yank the user out of the subject's Notes tab.
      await notes.createNote.mutateAsync(input);
      onClose();
    } else if (propNoteId) {
      await notes.updateNote.mutateAsync({ id: propNoteId, input: { title, bodyMd } });
      onClose();
    }
  };

  const handleDelete = async () => {
    if (propNoteId && confirm("Delete this note?")) {
      await notes.deleteNote.mutateAsync(propNoteId);
      onClose();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    const cleaned = cleanPasted(text);
    const start = textareaRef.current?.selectionStart ?? 0;
    const end = textareaRef.current?.selectionEnd ?? 0;
    setBodyMd((prev) => prev.slice(0, start) + cleaned + prev.slice(end));
  };

  const handleSelectionChange = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      const sel = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      setSelectedText(sel);
    }
  };

  // AI panels — each action opens its own panel, which owns its own requests
  // and errors. The JSON-dump path that used to live here died with P9: a
  // Flashcards result is cards to edit, not a blob to expand.
  const handleSummarise = () => {
    if (propNoteId) setPanel(panel === "summary" ? null : "summary");
  };
  const handleExplain = () => {
    if (propNoteId) setPanel(panel === "explain" ? null : "explain");
  };
  const handleQuiz = () => {
    if (propNoteId) setPanel(panel === "quiz" ? null : "quiz");
  };
  const handleFlashcards = () => {
    if (propNoteId) setPanel(panel === "flashcards" ? null : "flashcards");
  };

  // Read aloud opens the reading theatre (P10) — available on unsaved drafts too, since
  // reading is local; only Explain inside it needs the note to exist.
  const sentences = splitSentences(bodyMd);
  const handleReadAloud = () => setPanel(panel === "reading" ? null : "reading");

  // Attachments
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(async (file) => {
      setUploadProgress((p) => ({ ...p, [file.name]: 0 }));
      try {
        await notes.uploadAttachment.mutateAsync({
          noteId: propNoteId!,
          file,
          onProgress: (pct) => setUploadProgress((p) => ({ ...p, [file.name]: pct })),
        });
        setUploadProgress((p) => {
          const n = { ...p };
          delete n[file.name];
          return n;
        });
      } catch {
        setUploadProgress((p) => {
          const n = { ...p };
          delete n[file.name];
          return n;
        });
      }
    });
    e.target.value = "";
  };

  if (isNew && !propTopicId) {
    return (
      <Card>
        <EmptyState
          title="Select a topic first"
          hint="Choose a topic from the left to start taking notes."
        />
      </Card>
    );
  }

  return (
    <div
      className="sq-col"
      /* The flex chain down to the textarea needs a definite height to resolve against, and
         the panel gives it none — without a floor the textarea collapses to two lines. */
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 480 }}
    >
      {/* Reading theatre (P10) — portals to the body itself; conditioned here so it
          opens and closes with the same Read aloud toggle as the other panels. */}
      {panel === "reading" && (
        <ReadingTheatre
          noteId={propNoteId}
          title={title.trim() || titleFromBody(bodyMd) || "Untitled note"}
          bodyMd={bodyMd}
          onClose={() => setPanel(null)}
        />
      )}

      {/* Toolbar */}
      <Toolbar style={{ flexShrink: 0 }}>
        <ToolbarGroup>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title (auto-generated from first line if empty)"
            style={{ flex: 1, minWidth: 200 }}
          />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <ToolbarButton onClick={() => setPreview(!preview)} pressed={preview} title="Preview">
            👁
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setShowVersions(!showVersions)}
            pressed={showVersions}
            title="Versions"
          >
            🕐
          </ToolbarButton>
          <ToolbarButton
            onClick={() => setShowAttachments(!showAttachments)}
            pressed={showAttachments}
            title="Attachments"
          >
            📎
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <Chip tone="neutral">{wc} words</Chip>
          {autosaveStatus === "saving" && <Chip tone="warn">Saving…</Chip>}
          {autosaveStatus === "saved" && <Chip tone="ok">Saved</Chip>}
          {autosaveStatus === "error" && <Chip tone="bad">Save failed</Chip>}
        </ToolbarGroup>
      </Toolbar>

      {/* AI Action Bar */}
      <Card className="sq-ai-bar" style={{ flexShrink: 0, marginTop: "var(--s3)" }}>
        <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap", alignItems: "center" }}>
          <span className="sq-label" style={{ color: "var(--muted)" }}>
            AI
          </span>
          <Button
            size="sm"
            variant={panel === "summary" ? "primary" : "secondary"}
            onClick={handleSummarise}
            disabled={!propNoteId}
          >
            Summarise
          </Button>
          <Button
            size="sm"
            variant={panel === "explain" ? "primary" : "secondary"}
            onClick={handleExplain}
            disabled={!propNoteId}
          >
            Explain
          </Button>
          <Button
            size="sm"
            variant={panel === "quiz" ? "primary" : "secondary"}
            onClick={handleQuiz}
            disabled={!propNoteId}
          >
            Quiz
          </Button>
          <Button
            size="sm"
            variant={panel === "flashcards" ? "primary" : "secondary"}
            onClick={handleFlashcards}
            disabled={!propNoteId}
          >
            Flashcards
          </Button>
          <Button
            size="sm"
            variant={panel === "reading" ? "primary" : "secondary"}
            onClick={handleReadAloud}
            disabled={!sentences.length}
          >
            Read aloud
          </Button>
          {!propNoteId && (
            <span className="sq-help" style={{ margin: 0 }}>
              Save this note first — AI actions work on notes that exist.
            </span>
          )}
        </div>
      </Card>

      {/* Editor / Preview / AI panel */}
      {/* alignItems: stretch, not the .sq-row default of center — a textarea sizes to its
          `rows` attribute, so centring it leaves a two-line box inside a tall row.
          An AI panel occupies this same slot: a summary or explanation is read, not
          referenced, so it gets the full reading height rather than a strip above the note. */}
      <div
        className="sq-row"
        style={{ flex: 1, minHeight: 0, marginTop: "var(--s3)", alignItems: "stretch" }}
      >
        {/* `reading` is a portal, not a slot panel: the note stays visible behind it. */}
        {panel && panel !== "reading" && propNoteId ? (
          panel === "summary" ? (
            <SummaryPanel
              noteId={propNoteId}
              noteTitle={title}
              sourceWords={wc}
              topicId={noteTopicId}
              onClose={() => setPanel(null)}
            />
          ) : panel === "explain" ? (
            <ExplainPanel
              noteId={propNoteId}
              noteTitle={title}
              selection={selectedText}
              topicId={noteTopicId}
              onClose={() => setPanel(null)}
            />
          ) : panel === "quiz" ? (
            <QuizPanel
              noteId={propNoteId}
              noteTitle={title}
              sourceWords={wc}
              onClose={() => setPanel(null)}
            />
          ) : (
            <FlashcardPanel
              noteId={propNoteId}
              noteTitle={title}
              sourceWords={wc}
              topicId={noteTopicId}
              onClose={() => setPanel(null)}
            />
          )
        ) : !preview ? (
          <textarea
            ref={textareaRef}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            onPaste={handlePaste}
            onSelect={handleSelectionChange}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const start = e.currentTarget.selectionStart;
                const end = e.currentTarget.selectionEnd;
                setBodyMd((prev) => prev.slice(0, start) + "  " + prev.slice(end));
              }
            }}
            placeholder={isNew ? "Start writing your notes… (markdown supported)" : ""}
            style={{
              flex: 1,
              minHeight: 0,
              font: "var(--t-body)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              padding: "var(--s4)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              resize: "none",
              outline: "none",
              lineHeight: 1.6,
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: "var(--s4)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r-md)",
              overflow: "auto",
              background: "var(--page)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {plainText(bodyMd)}
          </div>
        )}

        {/* Sidebar: Versions / Attachments */}
        {(showVersions || showAttachments) && (
          <aside
            style={{
              width: 320,
              borderLeft: "1px solid var(--border)",
              padding: "var(--s3)",
              overflow: "auto",
            }}
          >
            {showVersions && (
              <div>
                <h4 style={{ margin: "0 0 var(--s3)", font: "var(--t-body)" }}>Versions</h4>
                <p className="sq-label">Version history will appear here after edits.</p>
              </div>
            )}
            {showAttachments && (
              <div>
                <div
                  className="sq-row"
                  style={{ justifyContent: "space-between", marginBottom: "var(--s2)" }}
                >
                  <h4 style={{ margin: 0, font: "var(--t-body)" }}>Attachments</h4>
                  <IconButton
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    aria-label="Attach file"
                  >
                    📎
                  </IconButton>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,text/*"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
                {Object.entries(uploadProgress).map(([name, pct]) => (
                  <div key={name} style={{ marginBottom: "var(--s2)" }}>
                    <div
                      className="sq-row"
                      style={{ justifyContent: "space-between", fontSize: "var(--t-body-sm)" }}
                    >
                      <span>{name}</span>
                      <span>{pct}%</span>
                    </div>
                    <progress value={pct} max={100} style={{ width: "100%", height: 4 }} />
                  </div>
                ))}
                <p className="sq-label">Attached files will appear here.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Footer actions */}
      <div
        className="sq-row"
        style={{
          justifyContent: "flex-end",
          gap: "var(--s2)",
          marginTop: "var(--s3)",
          flexShrink: 0,
        }}
      >
        {isNew ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Create Note</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={handleDelete} style={{ color: "var(--bad)" }}>
              Delete
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </>
        )}
      </div>
    </div>
  );
}
