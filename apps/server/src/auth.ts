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

export interface AuthDeps {
  orm: unknown;
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
  });
}

export type Auth = ReturnType<typeof createAuth>;
