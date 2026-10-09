/**
 * The Vercel build: one script, two artifacts.
 *
 *   1. The API server, bundled by esbuild into `api/index.mjs` — a single ESM
 *      file whose default export is the Node function handler (vercel.ts).
 *      Workspace TypeScript (@sq/db, @sq/core) is compiled *into* the bundle;
 *      heavy runtime packages stay external so Vercel's node-file-trace can
 *      pull the installed copies into the function. This mirrors the Netlify
 *      bundle in netlify/functions/build.mjs on purpose: same app, two hosts.
 *   2. The web app, through its ordinary build — Vercel serves apps/web/dist
 *      from the CDN and rewrites non-/api paths to the SPA shell.
 *
 * Migrations are not bundled here: vercel.json's `includeFiles` places
 * packages/db/migrations beside the function, and client.ts looks there.
 */
import { build } from "esbuild";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const OUT_DIR = "api";
const OUT_FILE = "api/index.mjs";

async function buildFunction() {
  if (existsSync(OUT_DIR)) {
    for (const file of readdirSync(OUT_DIR)) {
      rmSync(`${OUT_DIR}/${file}`, { recursive: true, force: true });
    }
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log("[vercel] bundling the API function…");
  await build({
    entryPoints: ["apps/server/src/vercel.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: OUT_FILE,
    external: [
      // Left for Vercel's trace to resolve against the installed tree: big
      // SDKs, the database drivers (loaded behind dynamic imports) and the
      // framework packages whose own dependency graphs must stay intact.
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
      "@electric-sql/pglite",
      "@hono/node-server",
      "better-auth",
      "drizzle-orm",
      "hono",
      "postgres",
      "zod",
    ],
    // A real `require` for the CommonJS that survives in the graph (dotenv
    // needs `require("fs")` at runtime): esbuild's ESM output looks for a
    // global `require` before falling back to its throwing shim. The import is
    // aliased because esbuild emits its own `createRequire` for some
    // dependencies — a second plain binding of that name is a SyntaxError the
    // moment the module loads. (Both facts proven by
    // scripts/vercel-function-smoke.mjs.)
    banner: {
      js: 'import { createRequire as __sqCreateRequire } from "module"; const require = __sqCreateRequire(import.meta.url);',
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    // No minification: stack traces in the function logs stay readable, and
    // nobody downloads this file over the wire.
    minify: false,
    sourcemap: false,
    logLevel: "info",
  });
  console.log(`[vercel] function built: ${OUT_FILE}`);
}

async function main() {
  await buildFunction();
  console.log("[vercel] building the web app…");
  // A single command string on Windows: the .cmd shim needs a shell, and
  // passing an args array alongside one raises a deprecation warning.
  if (process.platform === "win32") {
    execSync("pnpm --filter @sq/web build", { stdio: "inherit" });
  } else {
    execFileSync("pnpm", ["--filter", "@sq/web", "build"], { stdio: "inherit" });
  }
  console.log("[vercel] build complete.");
}

main().catch((err) => {
  console.error("[vercel] build failed:", err);
  process.exit(1);
});
