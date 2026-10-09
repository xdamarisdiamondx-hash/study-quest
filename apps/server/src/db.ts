// `.env` first: createDb() reads process.env.DATABASE_URL to pick the driver, and
// imports hoist above any config() call in index.ts. See env.ts.
import "./env.ts";

import { createDb } from "@sq/db/client";

/** The single database handle for the process. Created once at startup (ADR-003). */
export const db = await createDb();
export type Db = typeof db;
