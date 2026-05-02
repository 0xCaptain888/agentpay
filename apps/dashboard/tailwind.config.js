/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#ededed",
        card: "#141414",
        border: "#2a2a2a",
        accent: "#00d4aa",
        "accent-dim": "#00d4aa33",
        positive: "#22c55e",
        negative: "#ef4444",
        muted: "#666666",
      },
    },
  },
  plugins: [],
};
