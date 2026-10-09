/**
 * Load the repository `.env` into `process.env`, once, as the first import of every
 * server entry point.
 *
 * The order matters more than it looks. ES imports are hoisted above the importing
 * module's body, so a `config()` call in `index.ts` runs *after* its dependencies —
 * including the module that calls `createDb()` — have already been evaluated.
 * Reading `DATABASE_URL` a moment too late does not fail loudly: `createDb()` sees an
 * empty value and quietly starts the process on the built-in local database instead
 * of the one `.env` points at, which is how a day of studying ends up in the wrong
 * place. (`ai/settings.ts` documents the same hoisting rule for its own
 * `process.env` reads; those are resolved at call time for the same reason.)
 *
 * dotenv never overwrites a variable that is already set, so an explicit environment
 * — CI, a shell that exported `DATABASE_URL` — still wins over the file.
 */
import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

config({
  path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env"),
});
