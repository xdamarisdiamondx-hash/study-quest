import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client. `baseURL` is omitted on purpose: the browser calls its own origin
 * and Vite proxies /api to the server, so there is one origin and one set of cookies.
 * Sessions are httpOnly, so nothing is ever stored in JavaScript (ADR-023).
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
