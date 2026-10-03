import { eq } from "drizzle-orm";
import type { Context } from "hono";

import { users } from "@sq/db/schema";

import { db } from "../db.ts";
import type { AuthedEnv } from "./session.ts";
import { getSession } from "./session.ts";

/**
 * Hono environment for the subject/topic router: the shared Better Auth instance plus the
 * caller's app-level profile id, set by `requireProfile`.
 */
export interface ProfileEnv extends AuthedEnv {
  Variables: AuthedEnv["Variables"] & { profileId: string };
}

export type ProfileContext = Context<ProfileEnv>;

/**
 * Resolve the caller's app-level profile row.
 *
 * Every subject and topic route goes through this, so there is exactly one place that
 * turns a session into a user id — an unscoped query cannot slip through.
 */
export async function currentProfile(authUserId: string) {
  const [profile] = await db.orm
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  return profile ?? null;
}

/**
 * Middleware: require a session and an app profile, then put the profile id on the
 * context. Returns 401/409 and stops the chain when there is no usable identity, so every
 * route body can rely on `c.get("profileId")` being present.
 */
export async function requireProfile(c: ProfileContext): Promise<Response | undefined> {
  const session = await getSession(c.req.raw.headers, c.get("auth"));
  if (!session) return c.json({ error: "unauthorized" }, 401);

  const profile = await currentProfile(session.user.id);
  if (!profile) return c.json({ error: "no_profile" }, 409);

  c.set("profileId", profile.id);
  return undefined;
}
