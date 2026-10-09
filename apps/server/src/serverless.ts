/**
 * Serverless-host facts (Vercel, Netlify): the two differences that ripple
 * through the rest of the server.
 *
 * 1. There is no long-lived process — no interval scheduler, no bound socket
 *    to rebind, nothing that outlives a request. Reminders are synced on
 *    demand (routes/reminders.ts) and by the cron (routes/cron.ts).
 * 2. There is no writable disk beside `/tmp` — the local file store and the
 *    on-disk backups cannot live here, and the built bundle must never be
 *    mistaken for one.
 *
 * The checks are env-var reads rather than an import-time constant so tests
 * can flip them per case, and so a single bundled build serves both platforms.
 */

/** Vercel sets `VERCEL=1`, Netlify `NETLIFY=true`; both mark a serverless host. */
export function isServerless(): boolean {
  return process.env.VERCEL === "1" || process.env.NETLIFY === "true";
}

/**
 * The Vercel Cron contract: the platform calls `GET /api/cron/tick` with
 * `Authorization: Bearer $CRON_SECRET` — and so can anyone who guesses the
 * URL, which is why the secret is compared here before any work happens. No
 * configured secret means no admitted caller: an unset variable must fail
 * closed, not open.
 */
export function cronAuthorized(offered: string | undefined, secret: string | undefined): boolean {
  return Boolean(secret) && offered === `Bearer ${secret}`;
}
