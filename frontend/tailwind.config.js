/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1A3C5E',
        'primary-light': '#2D5A8E',
        accent: '#D4A017',
        'accent-light': '#F0C040',
        surface: '#FFFFFF',
        'surface-2': '#F7F9FC',
        'surface-3': '#EEF2F7',
        border: '#DDE3EC',
        'text-primary': '#1A1A2E',
        'text-secondary': '#5A6478',
        'text-muted': '#9AA3B0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        md: '0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)',
        lg: '0 10px 30px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)',
        xl: '0 20px 60px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.10)',
        glow: '0 0 20px rgba(212,160,23,0.25)',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
}
