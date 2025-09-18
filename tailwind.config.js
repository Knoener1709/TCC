/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        boto: {
          pink: '#F6A5C0',
          dark: '#B56582',
          water: '#94A1DB',
        },
      },
      keyframes: {
        water: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(2px)' },
        },
      },
      animation: {
        water: 'water 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
