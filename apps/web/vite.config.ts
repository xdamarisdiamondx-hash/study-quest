import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

const pkg = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// HTTPS for LAN installs (P20): scripts/lan-setup.ps1 writes this pair with
// mkcert. Without it preview serves plain HTTP — fine on localhost (a secure
// context by definition), not enough for a phone on the network, where the
// service worker and the install prompt need a trusted certificate.
const certDir = pkg("../../.certs");
const keyPath = `${certDir}/dev-key.pem`;
const certPath = `${certDir}/dev-cert.pem`;
const https =
  existsSync(keyPath) && existsSync(certPath)
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined;

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // A custom worker (src/offline/sw.ts) so the outbox drain, the runtime
      // caching rules and the prompt-style update all live in one reviewable file.
      strategies: "injectManifest",
      srcDir: "src/offline",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false, // AppShell registers through virtual:pwa-register/react
      manifest: {
        // A stable id so reinstalling or updating never forks the install
        // identity — "Study Quest at this origin's root", whatever the URL.
        id: "/",
        name: "Study Quest",
        short_name: "Study Quest",
        description:
          "A gamified study companion for organizing learning and tracking study progress.",
        theme_color: "#7c3aed",
        background_color: "#fafaf9",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        start_url: "/",
        scope: "/",
        lang: "en",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
      },
      // The service worker belongs to the build (preview and production); dev
      // stays worker-free so HMR is never fought over by a cache.
      devOptions: { enabled: false },
    }),
  ],
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
  preview: {
    port: 4173,
    strictPort: true,
    // 0.0.0.0 so a phone can reach the built app over the LAN (P20); the data
    // behind it stays protected by the PIN gate on the API.
    host: "0.0.0.0",
    https,
    proxy: {
      "/api": { target: "http://127.0.0.1:4321", changeOrigin: true },
    },
  },
});
