import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        panel: "var(--color-panel)",
        ink: "var(--color-ink)",
        teal: "var(--color-teal)",
        "teal-strong": "var(--color-teal-strong)",
        "marble-line": "var(--color-marble-line)",
      },
      boxShadow: {
        marble: "var(--shadow-marble)",
      },
    },
  },
  plugins: [],
};

export default config;
