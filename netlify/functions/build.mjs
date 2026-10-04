import { build } from "esbuild";
import { copyFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const outDir = "netlify/functions/api";
const entryPoint = "netlify/functions/api.ts";
const pkgSrc = join("netlify", "functions", "api", "package.json");
const pkgDest = join(outDir, "package.json");

async function buildFunction() {
  try {
    // Copy package.json FIRST (before cleaning output dir)
    if (existsSync(pkgSrc)) {
      copyFileSync(pkgSrc, pkgDest);
      console.log("✅ package.json copied to output directory");
    } else {
      console.warn("⚠️ package.json not found at source");
    }

    // Clean output directory (but keep package.json)
    if (existsSync(outDir)) {
      // Remove everything except package.json
      const files = (await import("fs")).readdirSync(outDir);
      for (const file of files) {
        if (file !== "package.json") {
          rmSync(join(outDir, file), { recursive: true, force: true });
        }
      }
    } else {
      mkdirSync(outDir, { recursive: true });
    }

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

    console.log("✅ Function built successfully to", outDir);
  } catch (err) {
    console.error("Build failed:", err);
    process.exit(1);
  }
}

buildFunction();