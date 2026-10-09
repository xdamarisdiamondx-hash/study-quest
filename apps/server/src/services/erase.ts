/**
 * Erasing everything a student owns (P22 privacy page).
 *
 * Two promises the page makes, kept here:
 *
 *   scope "data"    every row the profile owns goes, the account stays signed in,
 *                   and the blank profile sends the student through onboarding
 *                   again — the same state a fresh install starts in.
 *   scope "account" all of that, plus the sign-in itself: email, password hash
 *                   and every session. The next request 401s.
 *
 * Why deleting one row is enough: the schema cascades from `users.id` on every
 * user-owned table, and every child table cascades from its parent (schema/index.ts),
 * so dropping the profile row takes the whole graph with it. A table that did *not*
 * cascade would fail this transaction instead of quietly keeping rows — the failure
 * mode worth having on a destructive path. `search_index` is the one table with no
 * foreign key (triggers maintain it as content changes), so its user slice is cleared
 * by hand in the same transaction.
 *
 * Bytes are not transactional: attachment keys are collected first and their files
 * removed after the commit, counted rather than assumed.
 */
import { eq } from "drizzle-orm";

import type { Db } from "@sq/db/client";
import { attachments, searchIndex, user, users } from "@sq/db/schema";

import type { FileStore } from "../files/store.ts";

export interface EraseProfile {
  id: string;
  /** The Better Auth user this profile hangs off (kept unless the account goes too). */
  authUserId: string;
}

export interface EraseOptions {
  /** Also remove the sign-in: auth user, sessions, password. */
  deleteAccount: boolean;
}

export interface EraseReport {
  /** Attachment files actually removed from the store. */
  files: number;
  /** Files the store refused to remove (already gone counts as removed). */
  filesFailed: number;
  scope: "data" | "account";
}

export async function eraseEverything(
  db: Db,
  profile: EraseProfile,
  files: FileStore,
  options: EraseOptions,
): Promise<EraseReport> {
  const owned = await db.orm
    .select({ objectKey: attachments.objectKey })
    .from(attachments)
    .where(eq(attachments.userId, profile.id));

  const [existing] = await db.orm
    .select({ displayName: users.displayName, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, profile.id))
    .limit(1);

  await db.orm.transaction(async (tx) => {
    await tx.delete(searchIndex).where(eq(searchIndex.userId, profile.id));
    await tx.delete(users).where(eq(users.id, profile.id));
    if (options.deleteAccount) {
      // session and account rows cascade from here (schema/auth.ts).
      await tx.delete(user).where(eq(user.id, profile.authUserId));
    } else {
      // Same link to the account, none of the history. Empty settings mean
      // `needsOnboarding`, so the first run plays again from the top. The name
      // and timezone are identity, not study data — and sign-in only ever
      // *creates* the profile (`ensureProfile` is onConflictDoNothing), so a
      // blanked name would stay blank until the account itself was recreated.
      await tx.insert(users).values({
        id: profile.id,
        authUserId: profile.authUserId,
        displayName: existing?.displayName ?? "",
        timezone: existing?.timezone ?? "UTC",
      });
    }
  });

  let filesRemoved = 0;
  let filesFailed = 0;
  for (const row of owned) {
    try {
      await files.delete(row.objectKey);
      filesRemoved += 1;
    } catch {
      filesFailed += 1;
    }
  }

  return { files: filesRemoved, filesFailed, scope: options.deleteAccount ? "account" : "data" };
}
