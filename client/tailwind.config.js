// client/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sariraga: {
          50: '#ecfdf5',
          500: '#10b981',
          600: '#059669',
          900: '#064e3b',
        },
      },
    },
  },
  plugins: [],
}
