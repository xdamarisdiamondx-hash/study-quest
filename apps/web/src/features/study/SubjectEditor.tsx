/**
 * Rename / archive / delete sheet for one subject (P4).
 *
 * A native `<dialog>` gives focus trapping, Escape handling and the backdrop for free, so
 * the component only owns the form.
 */
import { useEffect, useRef, useState } from "react";
import { Monogram } from "@sq/ui";

import type { SubjectSummary } from "../../lib/subjectsApi";

export function SubjectEditor({
  subject,
  busy,
  onSave,
  onArchive,
  onDelete,
  onClose,
}: {
  subject: SubjectSummary;
  busy: boolean;
  onSave: (name: string) => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(subject.name);
  const [confirming, setConfirming] = useState<"delete" | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function close() {
    ref.current?.close();
    onClose();
  }

  const dirty = name.trim().length > 0 && name.trim() !== subject.name;

  return (
    <dialog ref={ref} className="sq-dialog" onClose={onClose} onCancel={onClose}>
      <form
        method="dialog"
        className="sq-col"
        style={{ gap: "var(--s4)" }}
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(name.trim());
        }}
      >
        <div className="sq-row" style={{ gap: "var(--s3)" }}>
          <Monogram text={subject.monogram} active large />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ font: "var(--t-h2)", margin: 0, color: "var(--strong)" }}>Edit subject</h2>
            <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
              The monogram follows the name, so it never needs choosing.
            </p>
          </div>
        </div>

        <div className="sq-field">
          <label htmlFor="subject-name">Name</label>
          <input
            id="subject-name"
            className="sq-input"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              setConfirming(null);
            }}
          />
        </div>

        {confirming === "delete" ? (
          <p className="sq-callout" style={{ color: "var(--bad-500)" }}>
            Deleting <b>{subject.name}</b> also deletes its {subject.topicCount} topic
            {subject.topicCount === 1 ? "" : "s"}. This cannot be undone.
          </p>
        ) : null}

        <div className="sq-row" style={{ justifyContent: "flex-end", gap: "var(--s2)" }}>
          {confirming === "delete" ? (
            <>
              <button
                type="button"
                className="sq-btn sq-btn-ghost"
                onClick={() => setConfirming(null)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="sq-btn sq-btn-danger"
                disabled={busy}
                onClick={() => void onDelete()}
              >
                Delete for good
              </button>
            </>
          ) : (
            <>
              <button type="button" className="sq-btn sq-btn-ghost" onClick={onArchive}>
                Archive
              </button>
              <button
                type="button"
                className="sq-btn sq-btn-danger"
                onClick={() => setConfirming("delete")}
              >
                Delete
              </button>
              <button type="submit" className="sq-btn sq-btn-primary" disabled={busy || !dirty}>
                {busy ? "Saving…" : "Save"}
              </button>
            </>
          )}
          <button type="button" className="sq-btn sq-btn-secondary" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
