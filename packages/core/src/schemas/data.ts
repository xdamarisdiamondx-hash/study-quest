/**
 * Erase contract (P22 privacy page): what the "delete everything" button sends.
 *
 * A destructive endpoint takes an explicit confirmation field rather than trusting
 * the UI to have asked — a stray POST from a script or a double-submitted form has
 * to fail on the server too, not only behind a `window.confirm`.
 */
import { z } from "zod";

/**
 * `data` — every subject, note, quiz, card, task, session, quest, XP row and
 * search entry, leaving a blank profile that starts onboarding again.
 * `account` — all of that plus the sign-in itself (email, password, sessions).
 */
export const eraseScope = z.enum(["data", "account"]);

export const eraseDataSchema = z.object({
  scope: eraseScope,
  /** The phrase the client must send back, exactly. */
  confirm: z.literal("ERASE"),
});

export type EraseScope = z.infer<typeof eraseScope>;
export type EraseData = z.infer<typeof eraseDataSchema>;
