/**
 * The Vercel entry point: the same Hono app the local server runs, wrapped in
 * the Node function signature Vercel calls for `/api/*` — (req, res) => void.
 *
 * Deliberately not `index.ts`: that file binds a port, starts the reminder
 * scheduler and serves the built web app from disk — all long-lived-process
 * concerns. On Vercel the CDN serves the static build, the cron hits
 * `/api/cron/tick`, and this module is the whole server. The bundle that
 * reaches the platform is produced by `scripts/build-vercel.mjs`.
 */
import { handle } from "@hono/node-server/vercel";

import { app } from "./app.ts";

export default handle(app);
