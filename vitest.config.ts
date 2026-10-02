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
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/server/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**", "apps/server/src/**"],
    },
  },
});
