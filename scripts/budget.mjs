/**
 * Size budgets for the built web app (P21 performance).
 *
 * Run after `pnpm --filter @sq/web build` — CI's build job does, and
 * `pnpm budget` chains the two locally. What it measures, and why:
 *
 * - **Initial JS** — only what index.html itself loads (the entry chunk plus
 *   its modulepreloads). Route pages are separate chunks after P21's split,
 *   so this number is the true first-paint cost; the plan caps it at 200 KB
 *   gzipped (§25 performance budget).
 * - **Initial CSS** — the stylesheet the shell paints with.
 * - **Web fonts** — the design is a system stack, so any font file appearing
 *   at all is a regression: each must stay under the per-file cap or the
 *   build fails with the file named.
 * - **Images** — icons and favicons; per-file cap so an unnoticed 2 MB
 *   splash cannot slip into the shell.
 *
 * Everything is gzip-compressed with Node's own zlib, so the numbers match
 * what a gzip-capable server would send, on every platform, for free.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = join(process.cwd(), "apps", "web", "dist");

const INITIAL_JS_GZIP = 200 * 1024;
const INITIAL_CSS_GZIP = 60 * 1024;
const FONT_FILE_GZIP = 120 * 1024;
const IMAGE_FILE = 200 * 1024;

/** @param {string} file */
function gz(file) {
  return gzipSync(readFileSync(file)).length;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

let failed = false;
function check(label, bytes, cap) {
  const ok = bytes <= cap;
  if (!ok) failed = true;
  const mark = ok ? "ok  " : "FAIL";
  console.log(`  ${mark} ${label.padEnd(38)} ${kb(bytes).padStart(10)}  (budget ${kb(cap)})`);
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`budget: ${DIST} not found — run the web build first.`);
  process.exit(1);
}

// --- what index.html actually loads on first paint ------------------------
const html = readFileSync(join(DIST, "index.html"), "utf8");
const initialRefs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
const initialJs = initialRefs.filter((p) => p.endsWith(".js")).map((p) => join(DIST, p));
const initialCss = initialRefs.filter((p) => p.endsWith(".css")).map((p) => join(DIST, p));

const initialJsBytes = initialJs.reduce((sum, f) => sum + gz(f), 0);
const initialCssBytes = initialCss.reduce((sum, f) => sum + gz(f), 0);

console.log(`\nstudy-quest web budgets — ${relative(process.cwd(), DIST)}\n`);
check("initial JS (gzipped)", initialJsBytes, INITIAL_JS_GZIP);
check("initial CSS (gzipped)", initialCssBytes, INITIAL_CSS_GZIP);

// --- per-file caps --------------------------------------------------------
const fonts = files.filter((f) => [".woff", ".woff2", ".ttf", ".otf"].includes(extname(f)));
for (const f of fonts) check(`font ${relative(DIST, f)}`, gz(f), FONT_FILE_GZIP);
if (fonts.length === 0) console.log("  ok   web fonts                              0 B  (design uses the system stack)");

const images = files.filter((f) => [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp", ".ico"].includes(extname(f)));
let worstImage = null;
for (const f of images) {
  const size = statSync(f).size;
  if (!worstImage || size > worstImage.size) worstImage = { f, size };
  if (size > IMAGE_FILE) check(`image ${relative(DIST, f)}`, size, IMAGE_FILE);
}
if (!worstImage || worstImage.size <= IMAGE_FILE) {
  console.log(`  ok   largest image ${worstImage ? relative(DIST, worstImage.f) : "(none)"}      ${worstImage ? kb(worstImage.size) : "0 B"}  (budget ${kb(IMAGE_FILE)})`);
}

// --- informational --------------------------------------------------------
const routeChunks = files.filter((f) => extname(f) === ".js" && !initialJs.includes(f));
const totalJs = files.filter((f) => extname(f) === ".js").reduce((s, f) => s + gz(f), 0);
const sw = files.find((f) => f.endsWith("sw.js"));
console.log(`\n  info route chunks: ${routeChunks.length}, all JS gzipped: ${kb(totalJs)}`);
if (sw) console.log(`  info service worker: ${kb(gz(sw))}`);
console.log("");

if (failed) {
  console.error("budget: over budget — see FAIL lines above.");
  process.exit(1);
}
console.log("budget: all within budget.");
