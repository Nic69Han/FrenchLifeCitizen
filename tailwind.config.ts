import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Direction artistique "Tableau de bord République"
        marine: {
          DEFAULT: "#0A1628",
          900: "#0A1628",
          800: "#0F2038",
          700: "#16304F",
          600: "#1F4068",
        },
        republique: "#F8F6F0",
        or: {
          DEFAULT: "#C9A84C",
          light: "#E0C672",
          dark: "#A8893A",
        },
        action: {
          DEFAULT: "#C0392B",
          light: "#E05545",
        },
        vert: "#2E8B57",
      },
      fontFamily: {
        sans: ["var(--font-plex)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        panel: "0 8px 40px -12px rgba(0,0,0,0.5)",
        glow: "0 0 24px -4px rgba(201,168,76,0.4)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
