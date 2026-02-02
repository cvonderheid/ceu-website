import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
      screens: {
        "2xl": "1200px",
      },
    },
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "system-ui"],
        body: ["Manrope", "ui-sans-serif", "system-ui"],
      },
      colors: {
        ink: "hsl(var(--ink))",
        mist: "hsl(var(--mist))",
        accent: "hsl(var(--accent))",
        accent2: "hsl(var(--accent-2))",
        surface: "hsl(var(--surface))",
        stroke: "hsl(var(--stroke))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        danger: "hsl(var(--danger))",
      },
      boxShadow: {
        glow: "0 20px 45px -30px hsla(235, 85%, 30%, 0.55)",
      },
      borderRadius: {
        xl: "1rem",
        lg: "0.85rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
