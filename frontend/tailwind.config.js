/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      colors: {
        mesh: {
          50: '#f0fdf9',
          100: '#ccfbed',
          200: '#9af5db',
          300: '#5fe9c5',
          400: '#2dd4ab',
          500: '#14b892',
          600: '#0d9476',
          700: '#0f7660',
          800: '#115d4e',
          900: '#124d42',
          950: '#042f28',
        },
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-subtle': 'pulse 4s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
