/**
 * Local reminder scheduler (ADR-017): one interval in the server process that
 * ticks every minute and, on start, immediately — catch-up on start is the
 * whole point, since the machine being off is the normal case for a local app.
 * There is no cron and no queue: the tick asks the pure engine what to say
 * (via `remindersSync`), applies it, and delivers what has come due.
 *
 * A slow tick cannot pile up: `inFlight` makes the interval a no-op while the
 * previous round is still running. One account's failure is logged and does
 * not stop the others (fresh accounts have no rows to deliver, so their first
 * ticks are quiet by construction).
 */
import { users } from "@sq/db/schema";

import { db } from "./db.ts";
import { remindersSync } from "./services/reminders.ts";

const TICK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const accounts = await db.orm.select({ id: users.id }).from(users);
    for (const account of accounts) {
      try {
        const outcome = await remindersSync(account.id, new Date());
        if (outcome.created || outcome.dropped || outcome.delivered || outcome.pruned) {
          console.log(
            `[scheduler] ${account.id.slice(0, 8)} created=${outcome.created}` +
              ` dropped=${outcome.dropped} delivered=${outcome.delivered} pruned=${outcome.pruned}`,
          );
        }
      } catch (err) {
        console.error(`[scheduler] sync failed for ${account.id.slice(0, 8)}`, err);
      }
    }
  } catch (err) {
    console.error("[scheduler] tick failed", err);
  } finally {
    inFlight = false;
  }
}

/** Start once — the boot tick delivers anything that came due while offline. */
export function startScheduler(): void {
  if (timer) return;
  void tick();
  timer = setInterval(() => void tick(), TICK_MS);
  console.log(`[scheduler] reminders ticking every ${TICK_MS / 1000}s`);
}
