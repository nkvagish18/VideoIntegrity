/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        graphite: {
          950: '#07090e',
          900: '#0b0f17',
          850: '#101623',
          800: '#151d2e',
          750: '#1a2336',
          700: '#1f2b42',
          650: '#263450',
          600: '#2d3d5b',
          500: '#475d84',
          400: '#7088b0',
          300: '#a3b8d6',
          200: '#cbd8eb',
          100: '#e5eefa',
        },
        cyber: {
          blue: '#0284c7',
          sky: '#38bdf8',
          cyan: '#06b6d4',
          teal: '#14b8a6',
          emerald: '#10b981',
          rose: '#f43f5e',
          amber: '#f59e0b',
          violet: '#8b5cf6',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'cyber-sm': '0 0 10px rgba(56, 189, 248, 0.1)',
        'cyber-md': '0 0 20px rgba(56, 189, 248, 0.15)',
        'cyber-danger': '0 0 25px rgba(244, 63, 94, 0.25)',
        'cyber-success': '0 0 25px rgba(16, 185, 129, 0.25)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
