/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          cyan: "#16BDD6",
          brown: "#3A2117",
          sand: "#F6EFE8",
          ink: "#221813"
        }
      },
      fontFamily: {
        heading: ["Sora", "sans-serif"],
        body: ["Source Sans 3", "sans-serif"]
      },
      boxShadow: {
        panel: "0 12px 35px -18px rgba(34, 24, 19, 0.35)"
      }
    }
  },
  plugins: []
};
