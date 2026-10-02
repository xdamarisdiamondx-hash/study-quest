import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../packages/ui/src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
  // The manager title is the project name, not the package name.
  title: "Study Quest",

  /**
   * pnpm's isolated node_modules makes Vite serve React straight out of the store
   * (`.pnpm/react@…/react/index.js`), whose CommonJS interop exposes no default
   * export, which breaks the preview with "does not provide an export named
   * 'default'". Dedupe plus explicit pre-bundling fixes it without aliasing —
   * aliasing to a file path would break `react/jsx-dev-runtime` subpaths.
   */
  viteFinal: async (viteConfig) => {
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-dom/client",
      ],
    };
    viteConfig.resolve = {
      ...viteConfig.resolve,
      dedupe: ["react", "react-dom"],
    };
    // Storybook's Vite build defaults to the classic JSX transform, which needs
    // `React` in scope and fails with "React is not defined". The app uses the
    // automatic runtime, so match it.
    viteConfig.esbuild = {
      ...viteConfig.esbuild,
      jsx: "automatic",
      jsxImportSource: "react",
    };
    return viteConfig;
  },
};

export default config;
