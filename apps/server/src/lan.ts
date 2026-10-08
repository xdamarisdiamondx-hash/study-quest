/**
 * LAN mode and the app PIN (P20, ADR-023).
 *
 * State lives in config.local.json at the repository root (git-ignored — the
 * same file ADR-023 reserves for local secrets): whether the API is open to
 * the network, the PIN's salted hash and the unlock token a cookie must match.
 * Opening the listener to the network without a configured PIN mints one at
 * boot and hands it back for the console — exposing the network and protecting
 * it are the same action, never two steps.
 *
 * This module also owns rebinding: Node cannot move a bound socket between
 * interfaces in place, so a toggle closes the listener and re-opens it on the
 * other address (same port, same process — sessions and the scheduler keep
 * running).
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_PATH = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
  "..",
  "config.local.json",
);

export interface LanState {
  enabled: boolean;
  /** Salted SHA-256 of the 4-digit PIN — the PIN itself is never stored. */
  pinHash: string | null;
  salt: string;
  /** Rotated on every enable/disable; the unlock cookie must match it exactly. */
  token: string;
}

let state: LanState | null = null;
/** Every other key of config.local.json, preserved across our writes. */
let others: Record<string, unknown> = {};

function fresh(): LanState {
  return {
    enabled: false,
    pinHash: null,
    salt: randomBytes(16).toString("hex"),
    token: randomBytes(24).toString("hex"),
  };
}

export function loadLan(): LanState {
  if (state) return state;
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
    state = { ...fresh(), ...(parsed.lan as Partial<LanState> | undefined) };
    others = parsed;
  } catch {
    others = {};
    state = fresh();
  }
  delete others.lan;
  return state;
}

function persist(patch: Partial<LanState>): LanState {
  const next = { ...loadLan(), ...patch };
  state = next;
  writeFileSync(CONFIG_PATH, `${JSON.stringify({ ...others, lan: next }, null, 2)}\n`);
  return next;
}

function hashPin(salt: string, pin: string): string {
  return createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

function equalHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length > 0 && ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function lanEnabled(): boolean {
  return loadLan().enabled;
}

/** True when the request carries the current unlock cookie. */
export function isUnlocked(cookieHeader: string | undefined): boolean {
  const match = /(?:^|;\s*)sq-lan=([^;\s]+)/.exec(cookieHeader ?? "");
  if (!match?.[1]) return false;
  return equalHex(match[1], loadLan().token);
}

/** The cookie set after a correct PIN or a toggle from an already-unlocked session. */
export function unlockCookie(): string {
  return `sq-lan=${loadLan().token}; Path=/; HttpOnly; SameSite=Lax`;
}

/* --- guessing resistance -------------------------------------------------- */

let failures = 0;
let lockedUntil = 0;

/** Five wrong PINs in a row buy a 30-second pause — a 4-digit PIN must not be
 *  a free online lottery ticket once the API is on the network. */
export function attemptsLocked(): boolean {
  return Date.now() < lockedUntil;
}

export function registerFailure(): void {
  failures += 1;
  if (failures >= 5) {
    failures = 0;
    lockedUntil = Date.now() + 30_000;
  }
}

export function clearFailures(): void {
  failures = 0;
  lockedUntil = 0;
}

export function verifyPin(pin: string): boolean {
  const current = loadLan();
  if (!current.pinHash || !/^\d{4}$/.test(pin)) return false;
  return equalHex(hashPin(current.salt, pin), current.pinHash);
}

/* --- the switch ----------------------------------------------------------- */

function mintPin(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

/** A new PIN, shown once. Returns the plaintext — the only moment it exists. */
export function rotatePin(): string {
  const pin = mintPin();
  persist({ pinHash: hashPin(loadLan().salt, pin) });
  clearFailures();
  return pin;
}

/**
 * Turn LAN mode on. Returns a freshly minted PIN the first time (the caller
 * shows it once), or null when a PIN was already configured — that plaintext
 * exists only in the student's memory, which is the point. The token rotates
 * either way, so every previously unlocked browser starts locked.
 */
export function enableLan(): string | null {
  const current = loadLan();
  let pin: string | null = null;
  let pinHash = current.pinHash;
  if (!pinHash) {
    pin = mintPin();
    pinHash = hashPin(current.salt, pin);
  }
  persist({ enabled: true, pinHash, token: randomBytes(24).toString("hex") });
  clearFailures();
  return pin;
}

export function disableLan(): void {
  persist({ enabled: false, token: randomBytes(24).toString("hex") });
  clearFailures();
}

/* --- rebinding ------------------------------------------------------------ */

let rebinder: ((enabled: boolean) => Promise<void>) | null = null;

export function setRebinder(fn: (enabled: boolean) => Promise<void>): void {
  rebinder = fn;
}

export async function rebind(enabled: boolean): Promise<void> {
  if (rebinder) await rebinder(enabled);
}

/* --- boot safety ---------------------------------------------------------- */

export type LanBoot = { onNetwork: false } | { onNetwork: true; minted: string | null };

/**
 * Called at boot with the address the process is about to listen on. A wildcard
 * bind without LAN configured does not stay unprotected: the mode switches on
 * and a PIN is minted for the console to print (the one place readable without
 * knowing it).
 */
export function ensureLanMatchesHost(host: string): LanBoot {
  if (host !== "0.0.0.0" && host !== "::") return { onNetwork: false };
  if (lanEnabled()) return { onNetwork: true, minted: null };
  return { onNetwork: true, minted: enableLan() };
}
