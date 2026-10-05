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
import { plainText, wordCount, splitSentences, titleFromBody, cleanPasted } from "@sq/core/markdown";

import { notesApi, type CreateNote } from "../../lib/notesApi";
import { useNoteActions, useAutosave, useReadAloud } from "../../lib/useNotes";

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

export function NoteEditor({ topicId: propTopicId, noteId: propNoteId, onClose, initialTitle = "", initialBody = "" }: NoteEditorProps) {
  const notes = useNoteActions();
  const [isNew] = useState(!propNoteId);
  const [title, setTitle] = useState(initialTitle);
  const [bodyMd, setBodyMd] = useState(initialBody);
  const [preview, setPreview] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [selectedText, setSelectedText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<string | null>(null);
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

  // AI actions
  const runAiAction = async (action: () => Promise<unknown>, _label: string) => {
    if (!propNoteId) return;
    setAiBusy(true);
    setAiError(null);
    setAiResult(null);
    try {
      const result = await action();
      if (result && typeof result === "object" && "text" in result) {
        setAiResult((result as { text?: string }).text || JSON.stringify(result, null, 2));
      } else {
        setAiResult(JSON.stringify(result, null, 2));
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "AI action failed");
    } finally {
      setAiBusy(false);
    }
  };

  const handleSummarise = () => runAiAction(() => notes.summarise.mutateAsync({ noteId: propNoteId! }), "Summarise");
  const handleExplain = () => {
    if (!selectedText) {
      setAiError("Select some text to explain");
      return;
    }
    runAiAction(() => notes.explain.mutateAsync({ noteId: propNoteId!, text: selectedText }), "Explain");
  };
  const handleQuiz = () => runAiAction(() => notes.quiz.mutateAsync({ noteId: propNoteId! }), "Quiz");
  const handleFlashcards = () => runAiAction(() => notes.flashcards.mutateAsync({ noteId: propNoteId! }), "Flashcards");

  // Read aloud
  const sentences = splitSentences(bodyMd);
  const { isPlaying, play } = useReadAloud(sentences);
  const handleReadAloud = () => play();

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
        setUploadProgress((p) => { const n = { ...p }; delete n[file.name]; return n; });
      } catch {
        setUploadProgress((p) => { const n = { ...p }; delete n[file.name]; return n; });
      }
    });
    e.target.value = "";
  };

  if (isNew && !propTopicId) {
    return (
      <Card>
        <EmptyState title="Select a topic first" hint="Choose a topic from the left to start taking notes." />
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
          <ToolbarButton onClick={() => setShowVersions(!showVersions)} pressed={showVersions} title="Versions">
            🕐
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowAttachments(!showAttachments)} pressed={showAttachments} title="Attachments">
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
          <span className="sq-label" style={{ color: "var(--muted)" }}>AI Actions:</span>
          <Button size="sm" onClick={handleSummarise} disabled={aiBusy || !propNoteId}>
            {aiBusy ? "⏳" : "📝"} Summarise
          </Button>
          <Button size="sm" onClick={handleExplain} disabled={aiBusy || !propNoteId || !selectedText}>
            {aiBusy ? "⏳" : "💡"} Explain
          </Button>
          <Button size="sm" onClick={handleQuiz} disabled={aiBusy || !propNoteId}>
            {aiBusy ? "⏳" : "❓"} Quiz
          </Button>
          <Button size="sm" onClick={handleFlashcards} disabled={aiBusy || !propNoteId}>
            {aiBusy ? "⏳" : "🗂"} Flashcards
          </Button>
          <Button size="sm" onClick={handleReadAloud} disabled={aiBusy || !sentences.length}>
            {isPlaying ? "⏸" : "🔊"} Read Aloud
          </Button>
          {aiError && <span className="sq-error" style={{ font: "var(--t-body-sm)" }}>{aiError}</span>}
        </div>
        {aiResult && (
          <details style={{ marginTop: "var(--s2)" }}>
            <summary className="sq-label" style={{ cursor: "pointer" }}>AI Result (click to expand)</summary>
            <pre style={{ marginTop: "var(--s2)", padding: "var(--s3)", background: "var(--surface)", borderRadius: "var(--r2)", overflow: "auto", fontSize: "var(--t-body-sm)" }}>
              {aiResult}
            </pre>
          </details>
        )}
      </Card>

      {/* Editor / Preview */}
      {/* alignItems: stretch, not the .sq-row default of center — a textarea sizes to its
          `rows` attribute, so centring it leaves a two-line box inside a tall row. */}
      <div className="sq-row" style={{ flex: 1, minHeight: 0, marginTop: "var(--s3)", alignItems: "stretch" }}>
        {!preview ? (
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
              borderRadius: "var(--r2)",
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
              borderRadius: "var(--r2)",
              overflow: "auto",
              background: "var(--surface)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {plainText(bodyMd)}
          </div>
        )}

        {/* Sidebar: Versions / Attachments */}
        {(showVersions || showAttachments) && (
          <aside style={{ width: 320, borderLeft: "1px solid var(--border)", padding: "var(--s3)", overflow: "auto" }}>
            {showVersions && (
              <div>
                <h4 style={{ margin: "0 0 var(--s3)", font: "var(--t-body)" }}>Versions</h4>
                <p className="sq-label">Version history will appear here after edits.</p>
              </div>
            )}
            {showAttachments && (
              <div>
                <div className="sq-row" style={{ justifyContent: "space-between", marginBottom: "var(--s2)" }}>
                  <h4 style={{ margin: 0, font: "var(--t-body)" }}>Attachments</h4>
                  <IconButton onClick={() => fileInputRef.current?.click()} title="Attach file" aria-label="Attach file">
                    📎
                  </IconButton>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf,text/*" onChange={handleFileSelect} style={{ display: "none" }} />
                {Object.entries(uploadProgress).map(([name, pct]) => (
                  <div key={name} style={{ marginBottom: "var(--s2)" }}>
                    <div className="sq-row" style={{ justifyContent: "space-between", fontSize: "var(--t-body-sm)" }}>
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
      <div className="sq-row" style={{ justifyContent: "flex-end", gap: "var(--s2)", marginTop: "var(--s3)", flexShrink: 0 }}>
        {isNew ? (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Create Note</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={handleDelete} style={{ color: "var(--bad)" }}>Delete</Button>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={handleSave}>Save</Button>
          </>
        )}
      </div>
    </div>
  );
}