import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const outDir = "netlify/functions/api";
const entryPoint = "netlify/functions/api.ts";

async function buildFunction() {
  try {
    // Clean output directory
    if (existsSync(outDir)) {
      rmSync(outDir, { recursive: true, force: true });
    }
    mkdirSync(outDir, { recursive: true });

    console.log("Building function...");

    // Build with esbuild
    await build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: "node",
      target: "node20",
      format: "esm",
      outfile: join(outDir, "index.mjs"),
      external: [
        "@neondatabase/serverless",
        "better-auth",
        "drizzle-orm",
        "hono",
        "zod",
      ],
      banner: {
        js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
      },
      define: {
        "process.env.NODE_ENV": '"production"',
      },
      minify: true,
      sourcemap: true,
    });

    // package.json is already in the output directory (same as source)
    console.log("✅ package.json already in output directory");

    console.log("✅ Function built successfully to", outDir);
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1);
  }
}

buildFunction();