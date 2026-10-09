/**
 * Data portability and backups (P21): the three things a student owns —
 * take it all with you, put it back, and one zip a day in data/backups.
 *
 * Export streams the same archive the scheduler writes (dump + attachments +
 * README), import is replace-not-merge behind an explicit confirm (the same
 * rule A.8 gave onboarding), and the backup row doubles as the nudge: older
 * than a day says so, in words, without a badge to dismiss.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card } from "@sq/ui";

interface BackupInfo {
  file: string;
  bytes: number;
  at: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "3 h ago" — from an age already measured, never from the clock in render. */
function ageLabel(ageMs: number): string {
  if (ageMs < 60 * 60 * 1000) return `${Math.max(1, Math.round(ageMs / 60_000))} min ago`;
  if (ageMs < DAY_MS) return `${Math.round(ageMs / (60 * 60 * 1000))} h ago`;
  return `${Math.round(ageMs / DAY_MS)} days ago`;
}

/**
 * One row's copy, decided the moment it arrives — the clock is read in the
 * fetch handler, not in render, so re-rendering never changes the wording
 * (react-hooks/purity) or makes the nudge flicker.
 */
interface LoadedBackup {
  info: BackupInfo;
  age: string;
  stale: boolean;
}

function describe(info: BackupInfo): LoadedBackup {
  const ageMs = Date.now() - Date.parse(info.at);
  return { info, age: ageLabel(ageMs), stale: ageMs > DAY_MS };
}

export function DataCard() {
  const [last, setLast] = useState<LoadedBackup | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<null | "export" | "backup" | "import">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/backup");
        if (res.ok) {
          const body = (await res.json()) as { last: BackupInfo | null };
          if (!cancelled && body.last) setLast(describe(body.last));
        }
      } catch {
        // Offline: the card simply shows no backup row yet.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function download() {
    setActive("export");
    setError(null);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) throw new Error(`export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `studyquest-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "export failed");
    } finally {
      setActive(null);
    }
  }

  async function backUp() {
    setActive("backup");
    setError(null);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const body = (await res.json()) as { last?: BackupInfo; message?: string };
      if (!res.ok || !body.last) throw new Error(body.message ?? "backup failed");
      setLast(describe(body.last));
    } catch (err) {
      setError(err instanceof Error ? err.message : "backup failed");
    } finally {
      setActive(null);
    }
  }

  async function importFile(file: File) {
    const ok = window.confirm(
      "Import replaces EVERYTHING in Study Quest with the contents of this file.\n\n" +
        "Subjects, notes, tasks, quiz history, XP — all of it becomes what is in the file. " +
        "The current data is not kept.\n\nContinue?",
    );
    if (!ok) return;
    setActive("import");
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/zip" },
        body: file,
      });
      const body = (await res.json()) as { ok?: boolean; rows?: number; message?: string };
      if (!res.ok || !body.ok) throw new Error(body.message ?? "import failed");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "import failed");
      setActive(null);
    }
  }

  return (
    <Card title="Data">
      <p className="sq-help" style={{ marginTop: 0 }}>
        Your study data lives in one PostgreSQL database — on this machine, or wherever
        <code> .env</code> points it. Export takes all of it — rows, attachments and a README — as
        one zip. Backups write the same zip to
        <code> data/backups</code> once a day, keeping the last 14.
      </p>

      <div className="sq-row" style={{ gap: "var(--s3)", flexWrap: "wrap" }}>
        <Button variant="secondary" disabled={active !== null} onClick={() => void download()}>
          {active === "export" ? "Preparing…" : "Export everything (.zip)"}
        </Button>
        <Button variant="secondary" disabled={active !== null} onClick={() => void backUp()}>
          {active === "backup" ? "Backing up…" : "Back up now"}
        </Button>
        <Button variant="ghost" disabled={active !== null} onClick={() => fileRef.current?.click()}>
          {active === "import" ? "Importing…" : "Import this file…"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = ""; // picking the same file twice must still fire
            if (file) void importFile(file);
          }}
        />
      </div>

      <p className="sq-label" style={{ marginBottom: 0 }}>
        {!loaded
          ? "Checking backups…"
          : last
            ? `Last backup: ${last.info.file} · ${last.age}`
            : "No backups yet."}
        {last?.stale ? " Your last backup is over a day old." : ""}
      </p>

      {error ? (
        <p className="sq-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="sq-help" style={{ marginBottom: 0 }}>
        <Link to="/privacy">
          What is stored, what leaves this machine, and how to delete everything
        </Link>
      </p>
    </Card>
  );
}
