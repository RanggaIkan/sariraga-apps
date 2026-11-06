// client/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        canvas: '#EEF1F4',
        line: '#E3E7EB',
        ink: { DEFAULT: '#17201C', soft: '#56625C', faint: '#8A958F' },
        brand: { DEFAULT: '#1F7A55', hover: '#196446', tint: '#E3F1EA' },
        sky: { DEFAULT: '#E3EDF8', ink: '#2F65A6' },
        pastel: { botol: '#DCF2E6', kaleng: '#FAEDCD', kardus: '#EFE4D8' },
      },
      borderRadius: {
        card: '20px',
      },
    },
  },
  plugins: [],
}
