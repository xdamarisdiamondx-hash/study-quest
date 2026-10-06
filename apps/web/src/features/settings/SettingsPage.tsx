/**
 * Settings (P6): the AI platform's control panel.
 *
 * Everything here is what the server already knows how to answer — provider, model, where
 * the key came from, health, usage against the daily cap, the monthly estimate and the
 * generation log. The key is reported, never entered: `.env` is the source of truth for
 * every account (ADR-023), so the page says *where* the credential comes from rather than
 * collecting a second copy of it.
 *
 * `mock` is deliberately absent from the provider list. It exists for tests; offering it
 * here would let canned answers pass for the model, which is the thing `chainFor` refuses
 * to do by never falling back to it automatically.
 */
import { useCallback, useEffect, useState } from "react";
import type { AiProviderName } from "@sq/core/schemas/ai";
import { Button, Card, Chip, EmptyState, Input, Picker, Track } from "@sq/ui";

import { aiApi, type AiSettingsView } from "../../lib/aiApi";
import { useFlash } from "../../lib/useAiStream";

interface ProviderInfo {
  value: AiProviderName;
  label: string;
  /** The `.env` variable that turns this provider on. */
  env: string;
  /** What to put in it — a key, or a URL. */
  envHint: string;
}

const PROVIDERS: ProviderInfo[] = [
  {
    value: "groq",
    label: "Groq",
    env: "GROQ_API_KEY",
    envHint: "an API key from console.groq.com",
  },
  {
    value: "gemini",
    label: "Google Gemini",
    env: "GEMINI_API_KEY",
    envHint: "an API key from aistudio.google.com",
  },
  {
    value: "ollama",
    label: "Ollama (runs locally)",
    env: "OLLAMA_BASE_URL",
    envHint: "the address of a running Ollama, e.g. http://127.0.0.1:11434",
  },
  {
    value: "openaiCompat",
    label: "OpenAI-compatible",
    env: "OPENAI_COMPAT_BASE_URL",
    envHint: "the base URL of an OpenAI-compatible server",
  },
];

const LABELS = new Map(PROVIDERS.map((p) => [p.value, p.label]));
const labelFor = (name: string) => LABELS.get(name as AiProviderName) ?? name;

/** Costs are frequently a fraction of a cent; two decimals would read as nothing. */
const money = (usd: number) =>
  usd === 0 ? "$0.00" : usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const H1 = {
  font: "var(--t-h1)",
  margin: "0 0 var(--s1)",
  color: "var(--strong)",
  letterSpacing: "-.025em",
} as const;

const SUB = { margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" } as const;

export function SettingsPage() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  /** Draft of the model field, so typing is not fought by the load that follows a save. */
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash();

  const load = useCallback(async () => {
    // Deliberately does not set "loading": reloads happen behind an action the student is
    // already watching (a saved provider, a "Check again" press), and `busy` covers those.
    try {
      const next = await aiApi.settings();
      setView(next);
      setModel(next.model);
      setError(null);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Settings could not be loaded.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is the one case where an effect is right — there is no event to
    // fetch from — and the state updates happen in the promise callbacks, never
    // synchronously in the effect body. `load` stays for the reloads that follow an action.
    let cancelled = false;
    aiApi
      .settings()
      .then((next) => {
        if (cancelled) return;
        setView(next);
        setModel(next.model);
        setError(null);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Settings could not be loaded.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : "That change could not be saved.");
    setFlash("Could not save");
  };

  const saveProvider = async (value: string | null) => {
    if (!value || !view || value === view.provider) return;
    setBusy(true);
    try {
      await aiApi.update({ provider: value as AiProviderName });
      setFlash("Saved");
      // Reload rather than patch locally: the health list is a probe of what is stored, so
      // it has to be re-run for the new choice to mean anything.
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const saveModel = async () => {
    const trimmed = model.trim().slice(0, 120);
    if (!view || trimmed === view.model) return;
    setBusy(true);
    try {
      await aiApi.update({ model: trimmed });
      setView((v) => (v ? { ...v, model: trimmed } : v));
      setFlash("Saved");
    } catch (err) {
      fail(err);
      setModel(view.model);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    try {
      const { health } = await aiApi.test();
      setView((v) => (v ? { ...v, health } : v));
      setFlash(health.some((h) => h.ok) ? "Connection OK" : "Nothing answered");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const turnAiOn = async () => {
    setBusy(true);
    try {
      await aiApi.update({ enabled: true });
      await load();
      setFlash("AI turned on");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const info = view ? PROVIDERS.find((p) => p.value === view.provider) : undefined;
  const healthy = view?.health.filter((h) => h.ok) ?? [];
  const off = view !== null && !view.enabled;
  const nothingConfigured = view !== null && view.enabled && healthy.length === 0;

  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div>
        <h1 style={H1}>Settings</h1>
        <p style={SUB}>What the AI features call, where the key comes from, and what it costs</p>
      </div>

      {status === "loading" && !view ? (
        <Card>
          <p style={{ ...SUB, margin: 0 }}>Loading settings…</p>
        </Card>
      ) : null}

      {status === "error" && !view ? (
        <Card title="Settings">
          <p style={{ ...SUB, margin: "0 0 var(--s4)", color: "var(--bad-500)" }}>{error}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      ) : null}

      {/* A reload that fails after the first one leaves `view` in place — the last good
          settings still stand, but the student should be told they are stale. */}
      {status === "error" && view ? (
        <p style={{ ...SUB, color: "var(--bad-500)" }}>{error}</p>
      ) : null}

      {view ? (
        <>
          <Card title="AI" action={flash ? <span className="sq-label">{flash}</span> : null}>
            <div
              className="sq-row"
              style={{ gap: "var(--s4)", alignItems: "flex-start", flexWrap: "wrap" }}
            >
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <Picker
                  label="Provider"
                  value={view.provider}
                  options={PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
                  onChange={(v) => void saveProvider(v)}
                  disabled={busy}
                  hint={
                    view.chain.length > 1
                      ? `Tried first; ${view.chain.slice(1).map(labelFor).join(", ")} follow if it fails.`
                      : undefined
                  }
                />
              </div>

              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div className="sq-field">
                  <label htmlFor="ai-model">Model</label>
                  <Input
                    id="ai-model"
                    value={model}
                    placeholder="Use the built-in default"
                    disabled={busy}
                    maxLength={120}
                    onChange={(e) => setModel(e.target.value)}
                    onBlur={() => void saveModel()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveModel();
                    }}
                  />
                  <p className="sq-help">
                    Blank means the default for this provider and for each prompt's tier. Set
                    <code> GROQ_</code>-style variables in `.env` to change them without code.
                  </p>
                </div>
              </div>
            </div>

            <div
              className="sq-row"
              style={{ gap: "var(--s3)", alignItems: "center", marginTop: "var(--s4)" }}
            >
              <span className="sq-label">API key</span>
              <Chip tone={view.hasApiKey ? "accent" : view.envHasApiKey ? "ok" : "warn"}>
                {view.hasApiKey
                  ? "Set for this account"
                  : view.envHasApiKey
                    ? "Server key configured"
                    : "Not configured"}
              </Chip>
            </div>
            <p className="sq-help" style={{ marginTop: "var(--s2)" }}>
              Keys live in `.env` on the machine running Study Quest. They are never stored in the
              database and are never sent to this page, so there is no field for one here.
              {info ? ` ${info.label} needs ${info.envHint} in \`${info.env}\`.` : ""}
            </p>

            <div
              className="sq-row"
              style={{ gap: "var(--s3)", marginTop: "var(--s5)", alignItems: "center" }}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void testConnection()}
                disabled={busy}
              >
                {busy ? "Checking…" : "Test connection"}
              </Button>
              {view.health.length > 0 ? (
                <span className="sq-label">
                  {healthy.length} of {view.health.length} answering
                </span>
              ) : null}
            </div>

            {view.health.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: "var(--s4) 0 0" }}>
                {view.health.map((h) => (
                  <li
                    key={h.provider}
                    className="sq-row"
                    style={{ gap: "var(--s3)", padding: "var(--s2) 0", alignItems: "center" }}
                  >
                    <Chip tone={h.ok ? "ok" : h.detail ? "warn" : "bad"}>
                      {h.ok ? "OK" : "Down"}
                    </Chip>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{labelFor(h.provider)}</span>
                    <span style={{ color: "var(--muted)", fontSize: 13, flex: 1, minWidth: 0 }}>
                      {h.model ? `${h.model}${h.detail ? " · " : ""}` : ""}
                      {h.detail ?? ""}
                    </span>
                    {h.ok && h.latencyMs !== undefined ? (
                      <span className="sq-num" style={{ fontSize: 13 }}>
                        {h.latencyMs}ms
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {off ? (
              <div style={{ marginTop: "var(--s5)" }}>
                <EmptyState
                  title="AI is switched off"
                  hint="Summaries, explanations, quizzes and flashcards will not run until it is back on."
                  action={<Button onClick={() => void turnAiOn()}>Turn AI on</Button>}
                />
              </div>
            ) : null}

            {nothingConfigured ? (
              <div style={{ marginTop: "var(--s5)" }}>
                <EmptyState
                  title="No AI provider is configured"
                  hint={
                    info
                      ? `Add \`${info.env}\` to \`.env\` in the project root (${info.envHint}), restart the server, then check again.`
                      : "Add a provider key to `.env`, restart the server, then check again."
                  }
                  action={
                    <Button variant="secondary" onClick={() => void load()}>
                      Check again
                    </Button>
                  }
                />
              </div>
            ) : null}
          </Card>

          <Card title="Usage">
            <Track
              label="Generations today"
              value={view.usedToday}
              max={view.dailyCap}
              caption={`${view.usedToday} of ${view.dailyCap}`}
            />
            <p style={{ ...SUB, marginTop: "var(--s4)" }}>
              {view.generationsThisMonth} this month · {view.tokensInThisMonth} tokens in ·{" "}
              {view.tokensOutThisMonth} out · {money(view.estimatedCostUsdThisMonth)} estimated
            </p>
            <p style={{ ...SUB, marginTop: "var(--s2)" }}>
              The daily cap resets at midnight; the estimate resets {when(view.monthStart)}. Cached
              results are free — they are served from what has already been generated.
            </p>
          </Card>

          <Card
            title="Recent generations"
            action={<span className="sq-label">{view.recent.length}</span>}
          >
            {view.recent.length === 0 ? (
              <p style={{ ...SUB, margin: 0 }}>
                Nothing generated yet. Summaries and explanations appear here once they are used.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {view.recent.map((a) => (
                  <li
                    key={a.id}
                    className="sq-row"
                    style={{ gap: "var(--s3)", padding: "var(--s2) 0", alignItems: "center" }}
                  >
                    <Chip tone="neutral">{a.kind}</Chip>
                    <span style={{ fontSize: 14, flex: 1, minWidth: 0 }}>
                      {labelFor(a.provider)} · {a.model}
                    </span>
                    <span className="sq-num" style={{ fontSize: 13 }}>
                      {a.tokensIn} in · {a.tokensOut} out
                    </span>
                    <span style={{ color: "var(--muted)", fontSize: 13 }}>{when(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
