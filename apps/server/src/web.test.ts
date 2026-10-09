/**
 * Serving the built app (P22): the two rules of web.ts — a file that exists is
 * served with the right cache policy, a client-side route gets the app shell — plus
 * the guard that keeps request paths inside the build directory.
 *
 * The test builds its own miniature `dist` in a temp folder: asserting against the
 * real `apps/web/dist` would only prove that a build had been run, and would fail in
 * CI, which builds after the tests.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveWeb } from "./web.ts";

let dist: string;

/** A sibling file sitting next to `dist`, which no request may ever reach. */
let outside: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "sq-web-"));
  outside = join(tmpdir(), `sq-web-outside-${Date.now()}.txt`);

  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Study Quest</title>");
  writeFileSync(join(dist, "assets", "app-B1x9q.js"), "console.log(1)");
  writeFileSync(join(dist, "sw.js"), "// service worker");
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\n");
  writeFileSync(join(dist, "manifest.webmanifest"), "{}");
  writeFileSync(join(dist, "icon-512.png"), "png-bytes");
  writeFileSync(outside, "must not be served");
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
  rmSync(outside, { force: true });
});

describe("resolveWeb", () => {
  it("serves a file that exists, fingerprinted assets cached forever", () => {
    const found = resolveWeb(dist, "/assets/app-B1x9q.js");
    expect(found).not.toBeNull();
    expect(found!.path).toBe(join(dist, "assets", "app-B1x9q.js"));
    expect(found!.contentType).toBe("text/javascript; charset=utf-8");
    expect(found!.cacheControl).toBe("public, max-age=31536000, immutable");
  });

  it("never caches the files that name the live build", () => {
    const shell = resolveWeb(dist, "/index.html");
    expect(shell!.cacheControl).toBe("no-cache");
    expect(shell!.contentType).toBe("text/html; charset=utf-8");

    // A cached sw.js or index.html is how an update never reaches the browser.
    expect(resolveWeb(dist, "/sw.js")!.cacheControl).toBe("no-cache");
    expect(resolveWeb(dist, "/manifest.webmanifest")!.cacheControl).toBe("no-cache");
    expect(resolveWeb(dist, "/robots.txt")!.cacheControl).toBe("no-cache");

    // Public/ files that are not fingerprinted: cached, but not forever.
    expect(resolveWeb(dist, "/icon-512.png")!.cacheControl).toBe("public, max-age=86400");
  });

  it("gives client-side routes the app shell", () => {
    const shell = join(dist, "index.html");
    for (const route of ["/", "/privacy", "/settings", "/study/abc123/notes", "/privacy/"]) {
      const found = resolveWeb(dist, route);
      expect(found, `${route} did not get the shell`).not.toBeNull();
      expect(found!.path).toBe(shell);
      expect(found!.cacheControl).toBe("no-cache");
    }
  });

  it("misses as JSON for a file that is not there — never HTML to a script tag", () => {
    expect(resolveWeb(dist, "/assets/gone.js")).toBeNull();
    expect(resolveWeb(dist, "/missing.png")).toBeNull();
    expect(resolveWeb(dist, "/sw.js.bak")).toBeNull();
  });

  it("leaves API paths to the API", () => {
    expect(resolveWeb(dist, "/api/anything")).toBeNull();
    // Even one that would resolve to a real file above the API.
    expect(resolveWeb(dist, "/api/health")).toBeNull();
  });

  it("refuses to climb out of the build directory", () => {
    expect(resolveWeb(dist, `/../${outside.split(/[\\/]/).pop()}`)).toBeNull();
    expect(resolveWeb(dist, "/../../etc/passwd")).toBeNull();
    expect(resolveWeb(dist, "/..\\..\\windows\\win.ini")).toBeNull();
  });

  it("answers nothing at all when the app has not been built", () => {
    const empty = mkdtempSync(join(tmpdir(), "sq-web-empty-"));
    try {
      expect(resolveWeb(empty, "/")).toBeNull();
      expect(resolveWeb(empty, "/privacy")).toBeNull();
      expect(resolveWeb(empty, "/assets/app.js")).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
