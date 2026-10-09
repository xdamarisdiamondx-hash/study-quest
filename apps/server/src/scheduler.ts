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
import { logError, logLine } from "./log.ts";
import { backupIsStale, backupNow } from "./services/backup.ts";
import { remindersSync } from "./services/reminders.ts";
import { isServerless } from "./serverless.ts";

const TICK_MS = 60_000;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

/**
 * The reminder half of a tick, exposed for the serverless cron
 * (routes/cron.ts): one sync per account, one account's failure logged and
 * never stopping the others.
 */
export async function syncReminders(): Promise<{ accounts: number; changed: number }> {
  const accounts = await db.orm.select({ id: users.id }).from(users);
  let changed = 0;
  for (const account of accounts) {
    try {
      const outcome = await remindersSync(account.id, new Date());
      if (outcome.created || outcome.dropped || outcome.delivered || outcome.pruned) {
        changed += 1;
        logLine(
          "info",
          "scheduler",
          `${account.id.slice(0, 8)} created=${outcome.created} dropped=${outcome.dropped} delivered=${outcome.delivered} pruned=${outcome.pruned}`,
        );
      }
    } catch (err) {
      logError("scheduler", err);
    }
  }
  return { accounts: accounts.length, changed };
}

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await syncReminders();

    // P21 backup: one zip a day in data/backups, kept for two weeks. Checked
    // every tick because this machine being on is the exception (ADR-017) —
    // the first tick after a day off is exactly when the backup matters.
    // A serverless host has no disk worth keeping a zip on; Export (P21) is
    // its backup, on demand, and the routes say so (routes/data.ts).
    if (!isServerless() && backupIsStale()) {
      const info = await backupNow(db);
      logLine(
        "info",
        "scheduler",
        `backup written: ${info.file} (${Math.round(info.bytes / 1024)} KB)`,
      );
    }
  } catch (err) {
    logError("scheduler", err);
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
