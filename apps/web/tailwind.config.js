/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07080A",
          900: "#0B0D10",
          800: "#111318",
          700: "#181B22",
          600: "#22262F",
        },
        mist: {
          100: "#F4F4F5",
          300: "#D4D4D8",
          500: "#A1A1AA",
          600: "#71717A",
        },
        accent: {
          DEFAULT: "#5EEAD4",
          dim: "#2DD4BF",
          fg: "#042F2E",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(255,255,255,0.04), 0 24px 80px rgba(0,0,0,0.45)",
      },
    },
  },
  plugins: [],
};
