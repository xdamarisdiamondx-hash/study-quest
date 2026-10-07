/**
 * Rewards (P15, PRD §22): the two moments an XP award becomes visible where the
 * student already is, without navigating anywhere.
 *
 * - **The toast** — a small transient "+N XP" whenever a mutation reports an
 *   award. It only ever relays a number the *server* returned; the client never
 *   computes XP of its own.
 * - **The level watcher** — a dialog when the account's level actually rises.
 *   It listens on the query cache rather than each mutation: a level is one
 *   number, so watching the one key every screen shares keeps the celebration
 *   honest even when the award happened on a page with no view of its own. The
 *   first arrival only *primes* the baseline (where the account stood when this
 *   session began); every later arrival that is higher celebrates. The shell
 *   prefetches the view once at mount so the baseline exists even when the app
 *   opens on a deep link that never renders the query.
 *
 * State is only ever set from callbacks (subscription, timer, click), never in
 * an effect body — the rule `react-hooks/set-state-in-effect` exists to keep
 * exactly this flow explicit.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, LevelBadge } from "@sq/ui";

import { gamificationApi } from "./gamificationApi";
import { gamificationKeys, type GamificationView } from "./useGamification";

/** (amount, one-line reason) — a no-op outside the host so hooks stay safe anywhere. */
type RewardFn = (delta: number, label: string) => void;

const RewardsContext = createContext<RewardFn>(() => undefined);

/** Fire a reward toast: `reward(total, "Quiz attempt")` renders "+10 XP". */
export function useRewardToast(): RewardFn {
  return useContext(RewardsContext);
}

interface Toast {
  id: number;
  delta: number;
  label: string;
}

function LevelUpWatcher() {
  const queryClient = useQueryClient();
  const [levelUp, setLevelUp] = useState<{ level: number; title: string } | null>(null);
  const baseline = useRef<number | null>(null);

  useEffect(() => {
    const settle = () => {
      const view = queryClient.getQueryData<GamificationView>(gamificationKeys.view);
      if (!view) return;
      if (baseline.current === null) {
        // First sight of the session: that is where the account stood, no party.
        baseline.current = view.level.level;
        return;
      }
      if (view.level.level > baseline.current) {
        baseline.current = view.level.level;
        setLevelUp({ level: view.level.level, title: view.level.title });
      }
    };

    // The baseline must exist before any award can outrun it, even on pages
    // that never mount the view — so the shell asks for it once, silently.
    void queryClient
      .prefetchQuery({ queryKey: gamificationKeys.view, queryFn: () => gamificationApi.view() })
      .catch(() => undefined);

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated") settle();
    });
    return unsubscribe;
  }, [queryClient]);

  if (!levelUp) return null;
  return (
    <Dialog open onClose={() => setLevelUp(null)} title="Level up">
      <div
        className="sq-col"
        style={{ alignItems: "center", textAlign: "center", gap: "var(--s3)" }}
      >
        <LevelBadge level={levelUp.level} />
        <b style={{ font: "var(--t-h3)" }}>
          Level {levelUp.level} — {levelUp.title}
        </b>
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          Every point came from real work, and the ledger kept the receipt.
        </p>
        <Button onClick={() => setLevelUp(null)}>Keep going</Button>
      </div>
    </Dialog>
  );
}

export function RewardsHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const reward = useCallback<RewardFn>((delta, label) => {
    if (delta <= 0) return;
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { id, delta, label }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <RewardsContext.Provider value={reward}>
      {children}

      <div className="sq-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="sq-toast">
            <b>+{t.delta} XP</b>
            <span>{t.label}</span>
          </div>
        ))}
      </div>

      <LevelUpWatcher />
    </RewardsContext.Provider>
  );
}
