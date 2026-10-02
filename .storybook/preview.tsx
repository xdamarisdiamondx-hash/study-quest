import type { Preview } from "@storybook/react-vite";

import "../packages/ui/src/styles/tokens.css";
import "../packages/ui/src/styles/components.css";

const preview: Preview = {
  parameters: {
    a11y: { config: { rules: [{ id: "color-contrast", enabled: true }] } },
    controls: { expanded: true },
    backgrounds: { disable: true },
  },
  globalTypes: {
    theme: {
      description: "Colour theme",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", theme);
      return (
        <div
          style={{
            background: "var(--page)",
            color: "var(--text)",
            padding: "32px",
            minHeight: "100vh",
          }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
