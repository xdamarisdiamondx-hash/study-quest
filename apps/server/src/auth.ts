/**
 * Better Auth configuration.
 *
 * Email + password only, self-hosted in this process. Sessions are stored in the
 * local database and delivered as an httpOnly, SameSite=Lax cookie, so no token is
 * ever visible to the browser's JavaScript (ADR-012, ADR-023).
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import * as authSchema from "@sq/db/auth-schema";
import type { Orm } from "@sq/db/client";
import { users } from "@sq/db/schema";

/**
 * Create the app-level `users` row for an auth user, if it does not already exist.
 *
 * Idempotent, so it is safe to call from a sign-up hook and from a read path.
 */
export async function ensureProfile(orm: Orm, authUserId: string, name: string): Promise<void> {
  await orm
    .insert(users)
    .values({ authUserId, displayName: name })
    .onConflictDoNothing({ target: users.authUserId });
}

export interface AuthDeps {
  orm: Orm;
  /** Public origin of the API, used for cookie and CSRF checks. */
  baseURL: string;
  isProduction: boolean;
}

export function createAuth({ orm, baseURL, isProduction }: AuthDeps) {
  return betterAuth({
    appName: "Study Quest",
    baseURL: baseURL,

    database: drizzleAdapter(orm as never, {
      provider: "pg",
      schema: authSchema,
    }),

    // No email provider is configured: accounts are local and verification mail is
    // not required for a single-user app on one machine (ADR-012).
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh at most daily
      cookieCache: { enabled: false },
    },

    advanced: {
      useSecureCookies: isProduction,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      },
    },

    trustedOrigins: [baseURL, "http://localhost:5173", "http://127.0.0.1:5173"],

    /**
     * Create the app-level profile the moment an auth user exists.
     *
     * Doing it here rather than lazily in `/api/me` means the profile always exists by
     * the time a request needs it, so onboarding cannot fail on a brand-new account
     * that has not called `/api/me` yet.
     */
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureProfile(orm, user.id, user.name);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
