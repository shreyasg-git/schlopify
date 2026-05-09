/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "hsl(var(--color-primary) / <alpha-value>)",
          foreground: "hsl(var(--color-primary-foreground) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "hsl(var(--color-surface) / <alpha-value>)",
          foreground: "hsl(var(--color-surface-foreground) / <alpha-value>)",
        },
        background: "hsl(var(--color-background) / <alpha-value>)",
        foreground: "hsl(var(--color-foreground) / <alpha-value>)",
      },
      borderRadius: {
        surface: "var(--radius-surface)",
        button: "var(--radius-button)",
      },
      boxShadow: {
        brutal: "var(--shadow-brutal)",
      }
    },
  },
  plugins: [],
}
