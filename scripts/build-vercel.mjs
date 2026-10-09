/**
 * The Vercel build: one script, two artifacts.
 *
 *   1. The API server, bundled by esbuild into `api/index.js` — a single ESM
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
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "api";
// `.js`, not `.mjs`: Vercel's function discovery only matches .js/.ts inside
// api/, and ESM comes from the package.json written below. (A `functions`
// entry naming an undiscovered file fails the whole build.)
const OUT_FILE = "api/index.js";

async function buildFunction() {
  if (existsSync(OUT_DIR)) {
    for (const file of readdirSync(OUT_DIR)) {
      rmSync(`${OUT_DIR}/${file}`, { recursive: true, force: true });
    }
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  // api/ is its own package: `type: "module"` makes the bundle unambiguously
  // ESM for the function loader, whatever the repository root declares. (This
  // does not stop Vercel's api-dir builder from listing the root package.json's
  // dependencies as top-level entries in the trace map — nothing does. They
  // arrive as dangling symlink stubs: only files nft actually traced get
  // their .pnpm content, so each stub costs ~100 bytes and nothing imports it.)
  writeFileSync(
    join(OUT_DIR, "package.json"),
    `${JSON.stringify({ name: "study-quest-api", private: true, type: "module" }, null, 2)}\n`,
  );

  // Give api/ the same module view the local rehearsal has: a link to the
  // server's workspace-scoped node_modules, for externals that resolve there
  // (the trace itself only ever sees the repository root, because
  // .vercelignore hides this link — both locally and from the upload — so it
  // is recreated here during the platform's own build).
  const link = join(OUT_DIR, "node_modules");
  if (!existsSync(link)) {
    const target = join("apps", "server", "node_modules");
    if (process.platform === "win32") {
      symlinkSync(join(process.cwd(), target), link, "junction");
    } else {
      symlinkSync(target, link, "dir"); // relative: valid wherever the build runs
    }
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
      // Left for Vercel's trace to resolve against the installed tree: the
      // database drivers (postgres also loads behind a dynamic import) and
      // the R2 SDK, whose own dependency graphs must stay intact. Everything
      // else — including @hono/node-server, which builds the handler itself —
      // is compiled in, so the lambda cannot miss a module the bundle needs
      // at load time. postgres and the AWS packages are declared in the root
      // package.json as well: the tracer resolves them at the repository's
      // own scope, which is the only scope it can see for api/index.js.
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
      "@electric-sql/pglite",
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
