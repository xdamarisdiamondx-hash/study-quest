import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo, Monogram } from "@sq/ui";
import { useAuth } from "../../lib/useAuth";

/**
 * First-run onboarding (P3): the study loop, then a first subject.
 *
 * Four steps, each with one question. Nothing is required to continue except picking a
 * subject set on step 3 — the principle is that the student stays in control.
 */

interface Template {
  name: string;
  monogram: string;
  topicCount: number;
}

const JOURNEY = [
  {
    title: "Plan",
    body: "Add your assignments, deadlines and tests. Study Quest turns them into a plan for the day.",
    icon: (
      <>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </>
    ),
  },
  {
    title: "Study",
    body: "Write or paste your notes, then have them read back as a summary, an explanation or a quiz.",
    icon: (
      <>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
      </>
    ),
  },
  {
    title: "Review",
    body: "Get it wrong, see exactly what you missed, and retry only the parts you struggled with.",
    icon: (
      <>
        <path d="M20 11A8 8 0 1 0 12 20a8 8 0 0 0 6.3-3.1" />
        <path d="M20 5v6h-6" />
      </>
    ),
  },
  {
    title: "Progress",
    body: "Earn XP, keep a streak, and always know what to do next.",
    icon: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/onboarding/templates")
      .then((r) => r.json())
      .then((d: { subjects: Template[] }) => {
        setTemplates(d.subjects);
        // Preselect the first two: a sensible start, still editable (principle 4).
        setPicked(new Set(d.subjects.slice(0, 2).map((s) => s.name)));
      })
      .catch(() => setError("Could not load subject templates."));
  }, []);

  const total = JOURNEY.length + 1;
  const isSubjectStep = step === JOURNEY.length;

  function toggle(name: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjects: [...picked] }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await fetch("/api/onboarding/complete", { method: "POST" });
      await refresh();
      navigate("/", { replace: true });
    } catch {
      setError("Could not set up your subjects. Check that the local server is running.");
      setBusy(false);
    }
  }

  return (
    <main className="sq-onb">
      <div className="sq-ambient" aria-hidden="true" />

      <div className="sq-onb-card">
        <header className="sq-onb-head">
          <Logo size={32} />
          <div
            className="sq-onb-progress"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={total}
            aria-label={`Step ${step + 1} of ${total}`}
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className="sq-onb-dot"
                data-state={i < step ? "done" : i === step ? "now" : "todo"}
              />
            ))}
          </div>
        </header>

        {isSubjectStep ? (
          <section>
            <h1 className="sq-onb-title">What are you studying?</h1>
            <p className="sq-onb-sub">
              Pick a starting set. You can add, rename or remove any of these later — nothing is
              locked in.
            </p>

            <ul className="sq-onb-list">
              {templates.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    className="sq-onb-row"
                    aria-pressed={picked.has(t.name)}
                    onClick={() => toggle(t.name)}
                  >
                    <Monogram text={t.monogram} active={picked.has(t.name)} />
                    <span className="sq-onb-row-text">
                      <b>{t.name}</b>
                      <small>{t.topicCount} topics</small>
                    </span>
                    <span className="sq-onb-check" data-on={picked.has(t.name)} aria-hidden="true">
                      {picked.has(t.name) ? (
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m5 13 4.5 4.5L19 7" />
                        </svg>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section>
            <span className="sq-onb-step">Step {step + 1}</span>
            <h1 className="sq-onb-title">{JOURNEY[step]!.title}</h1>
            <p className="sq-onb-sub">{JOURNEY[step]!.body}</p>
            <div className="sq-onb-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {JOURNEY[step]!.icon}
              </svg>
            </div>
          </section>
        )}

        {error ? (
          <p className="sq-error" role="alert">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5v5M12 16h.01" />
            </svg>
            {error}
          </p>
        ) : null}

        <div className="sq-onb-actions">
          {step > 0 ? (
            <button
              type="button"
              className="sq-btn sq-btn-ghost"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          ) : (
            <span />
          )}

          {isSubjectStep ? (
            <button
              type="button"
              className="sq-btn sq-btn-primary"
              disabled={picked.size === 0 || busy}
              onClick={() => void finish()}
            >
              {busy
                ? "Setting up…"
                : `Continue with ${picked.size || "no"} subject${picked.size === 1 ? "" : "s"}`}
            </button>
          ) : (
            <button
              type="button"
              className="sq-btn sq-btn-primary"
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
