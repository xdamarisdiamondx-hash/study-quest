/**
 * Serving the built web app from the API process (P22).
 *
 * One process, one port. `scripts/start.ps1` promises that it "serves it and the API
 * from a single Node process on :4321", the README's technical table says the same,
 * and it is what runs at Windows logon — but the server only ever answered `/api/*`.
 * Everything else 404'd as JSON, so `http://localhost:4321/privacy` on a fresh load
 * was an error rather than the app. This is the missing half: the build output in
 * `apps/web/dist`, served from the same origin as the API (which the PWA's offline
 * behaviour also assumes).
 *
 * Two rules do all the work:
 *
 *   1. A file that exists in `dist` is served. Vite hashes everything under
 *      `/assets/`, so those get a year of immutable caching; `index.html`, `sw.js`,
 *      the manifest and `robots.txt` name the current build and are never cached,
 *      so an update reaches the browser on the next load.
 *   2. A path with no file extension is a client-side route — `/privacy`,
 *      `/study/<id>/notes` — and gets the app shell, which the router then handles.
 *      Paths *with* an extension miss as JSON: a script tag that gets HTML back
 *      turns a missing asset into a confusing parse error.
 *
 * Paths are resolved strictly inside `distRoot`: a request that climbs out of the
 * build directory is not ours to answer.
 */
import { statSync } from "node:fs";
import { extname, isAbsolute, join, normalize, relative, sep } from "node:path";

/** Every content type the build can emit. */
const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Vite rewrites these every build; the name in the URL is the fingerprint. */
const IMMUTABLE = "public, max-age=31536000, immutable";
/** Names the build that is live: a cached copy would pin an old version. */
const REVALIDATE = "no-cache";
const DEFAULT = "public, max-age=86400";

export interface WebAsset {
  /** Absolute path, already proven to be inside `distRoot`. */
  path: string;
  contentType: string;
  cacheControl: string;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function asset(path: string, cacheControl: string): WebAsset {
  return {
    path,
    contentType: CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
    cacheControl,
  };
}

/**
 * Cache policy per file:
 *   - `/assets/` is fingerprinted by Vite, so the URL can never ask for a stale copy;
 *   - the shell, the service worker, the manifest and robots.txt all *name* the
 *     build that is live, so they must be revalidated on every load — a cached
 *     `index.html` or `sw.js` is how an update never reaches the browser;
 *   - everything else (icons, fonts copied from `public/`) gets a day.
 */
function cacheFor(requestPath: string, target: string): string {
  if (requestPath.startsWith("/assets/")) return IMMUTABLE;
  const base = target.slice(target.lastIndexOf(sep) + 1).toLowerCase();
  if (
    base === "index.html" ||
    base === "sw.js" ||
    base === "robots.txt" ||
    base === "manifest.webmanifest"
  ) {
    return REVALIDATE;
  }
  return DEFAULT;
}

/**
 * Resolve a request path against a build directory.
 *
 * Returns `null` for anything this handler must not answer: API paths (they get the
 * JSON 404), paths that escape `distRoot`, missing files that look like files, and
 * everything when the build has not been produced yet.
 */
export function resolveWeb(distRoot: string, requestPath: string): WebAsset | null {
  // The API keeps its own JSON 404s — a fetch client is not a browser tab.
  if (requestPath.startsWith("/api/")) return null;

  const normalizedRoot = normalize(distRoot);
  const target = normalize(join(normalizedRoot, requestPath.replace(/^[/\\]+/, "")));

  // `..` must never climb out of the build directory (platform-agnostic: `relative`
  // reports `..` on POSIX and Windows, and an absolute result for another drive).
  const outside = relative(normalizedRoot, target);
  if (outside === ".." || outside.startsWith(`..${sep}`) || isAbsolute(outside)) return null;

  if (isFile(target)) {
    return asset(target, cacheFor(requestPath, target));
  }

  // No extension: a route in the client's eyes, so hand over the app shell.
  if (extname(target) !== "") return null;

  const shell = join(normalizedRoot, "index.html");
  return isFile(shell) ? asset(shell, REVALIDATE) : null;
}
