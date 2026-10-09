import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const pkg = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: "@sq/ui", replacement: pkg("packages/ui/src/index.tsx") },
      {
        find: "@sq/core/gamification",
        replacement: pkg("packages/core/src/gamification/index.ts"),
      },
      { find: "@sq/core/progress", replacement: pkg("packages/core/src/progress/index.ts") },
      { find: "@sq/db/schema", replacement: pkg("packages/db/src/schema/index.ts") },
    ],
  },
  test: {
    // Domain logic is plain TypeScript, so no DOM environment is needed (ADR-021).
    // The web tests are the offline queue's rules (P20), written to be DOM-free too.
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/server/**/*.test.ts", "apps/web/**/*.test.ts"],
    // The database-backed suites build a PGlite instance in beforeAll and apply every
    // migration to it (erase, reference). On a cold machine that is more than vitest's
    // 10 s hook default, and the failure reads as a broken test rather than a slow one.
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**", "apps/server/src/**"],
    },
  },
});
