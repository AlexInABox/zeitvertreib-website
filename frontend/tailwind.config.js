/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}', './node_modules/primeng/**/*.{js,ts}'],
  darkMode: 'class', // Enable dark mode by class
  theme: {
    extend: {
      fontFamily: {
        berlin: ['BerlinTypeWeb', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
