import type { Auth } from "../auth.ts";

/** Hono environment that carries the shared Better Auth instance. */
export interface AuthedEnv {
  Variables: { auth: Auth };
}

/**
 * Resolve the Better Auth session for a request, or null when signed out.
 *
 * The `auth` instance is passed in rather than imported so route modules cannot
 * accidentally construct a second one, and so this stays testable.
 */
export type Session = Awaited<ReturnType<Auth["api"]["getSession"]>>;

export function getSession(headers: Headers, auth: Auth): Promise<Session> {
  return auth.api.getSession({ headers });
}
