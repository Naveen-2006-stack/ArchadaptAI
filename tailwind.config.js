/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        stone: {
          50: '#F9F8F6',
          100: '#F3F1EC',
          200: '#E6E3DE',
          300: '#D5D0C7',
          400: '#A8A297',
          500: '#78736A',
          600: '#63666A',
          700: '#403D38',
          800: '#282623',
          900: '#121417',
          950: '#0B0C0E',
        },
        slate: {
          850: '#15181C',
          900: '#111315',
          950: '#0B0C0D',
        },
        terracotta: {
          400: '#D97E61',
          500: '#C86A4B',
          600: '#B25638',
        },
        copper: {
          500: '#B87333',
        },
        sage: {
          500: '#4A6B5D',
        },
        blueprint: {
          500: '#2B5B84',
          600: '#1E4364',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Plus Jakarta Sans', 'Inter', 'sans-serif'],
        serif: ['var(--font-serif)', 'Playfair Display', 'Cinzel', 'serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern': "radial-gradient(circle, rgba(0, 0, 0, 0.08) 1px, transparent 1px)",
        'grid-pattern-dark': "radial-gradient(circle, rgba(255, 255, 255, 0.1) 1px, transparent 1px)",
      },
      backgroundSize: {
        'grid-sm': '16px 16px',
        'grid-md': '24px 24px',
      },
    },
  },
  plugins: [],
};
