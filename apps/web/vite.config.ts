import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const pkg = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Specific subpaths first: a bare "@sq/ui" alias would also match
    // "@sq/ui/tokens.css" and rewrite it to a non-existent path.
    alias: [
      { find: "@sq/ui/tokens.css", replacement: pkg("../../packages/ui/src/styles/tokens.css") },
      {
        find: "@sq/ui/components.css",
        replacement: pkg("../../packages/ui/src/styles/components.css"),
      },
      { find: "@sq/ui", replacement: pkg("../../packages/ui/src/index.tsx") },
      {
        find: "@sq/core/gamification",
        replacement: pkg("../../packages/core/src/gamification/index.ts"),
      },
      { find: "@sq/core/progress", replacement: pkg("../../packages/core/src/progress/index.ts") },
      { find: "@sq/db/schema", replacement: pkg("../../packages/db/src/schema/index.ts") },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": { target: "http://127.0.0.1:4321", changeOrigin: true },
    },
  },
});