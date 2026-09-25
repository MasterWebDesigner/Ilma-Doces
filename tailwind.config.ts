import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf2f6", 100: "#fce7f0", 200: "#fbd0e3", 300: "#f8a9cb",
          400: "#f278a8", 500: "#d95383", 600: "#c93368", 700: "#ab2253",
          800: "#8f1f46", 900: "#7a1d3e",
        },
        wine: {
          50: "#fdf2f2", 100: "#fbe4e4", 200: "#f5c2c2", 300: "#eb8f8f",
          400: "#de5c5c", 500: "#c43030", 600: "#8b1515", 700: "#6e1010",
          800: "#550c0c", 900: "#3d0808",
        },
        chocolate: {
          50: "#fdf8f6", 100: "#f5ebe6", 200: "#ead5cb", 300: "#dbb7a7",
          400: "#c89482", 500: "#b97a66", 600: "#aa6656", 700: "#8e5447",
          800: "#5c3d2e", 900: "#3d271d",
        },
        creme: { 50: "#fdfbf7", 100: "#f9f5ec", 200: "#f3ecdf", 300: "#e8dcc8" },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        serif: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
