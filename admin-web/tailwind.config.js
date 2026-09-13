/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    // Match the responsive layout users previously saw at 80% browser zoom.
    screens: {
      sm: '512px',
      md: '614.4px',
      lg: '819.2px',
      xl: '1024px',
      '2xl': '1228.8px',
    },
    extend: {},
  },
  plugins: [],
};
