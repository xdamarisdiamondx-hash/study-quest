import { createDb } from "@sq/db/client";

/** The single database handle for the process. Created once at startup (ADR-003). */
export const db = await createDb();
export type Db = typeof db;
