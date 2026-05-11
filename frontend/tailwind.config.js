/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#1F4E79", light: "#2E75B6", pale: "#BDD7EE" },
        pending: "#FFF2CC",
        confirmed: "#E2EFDA",
        excluded: "#FCE4D6",
      },
    },
  },
  plugins: [],
};
