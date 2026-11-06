// Mirrors Pulse's Tailwind setup (CSS-variable theme tokens, tailwindcss-animate,
// same spacing/radius/type conventions) with hopnøsis brand values in src/index.css (copied from the PowerHER admin).
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Jost', 'Futura', 'Arial', 'sans-serif'],
        display: ['Jost', 'Futura', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        theme: {
          'bg-primary': 'var(--bg-primary)',
          'bg-secondary': 'var(--bg-secondary)',
          'bg-tertiary': 'var(--bg-tertiary)',
          'bg-hover': 'var(--bg-hover)',
          'text-primary': 'var(--text-primary)',
          'text-secondary': 'var(--text-secondary)',
          'text-muted': 'var(--text-muted)',
          'border-primary': 'var(--border-primary)',
          'border-secondary': 'var(--border-secondary)',
        },
        // hopnøsis brand (fixed values so Tailwind opacity modifiers like /20 work). Mirrors src/index.css.
        brand: { DEFAULT: '#0d0d0d', hover: '#2c2a27', soft: '#ecebe7' },
        accent: { DEFAULT: '#b37a00', strong: '#8a5d00', soft: '#f7efdc' },
        gold: { DEFAULT: '#1a8f9a', soft: '#e2f4f5', ink: '#0e6168' },
        flavour: { classic: '#cc8a00', mango: '#ffb33f', lime: '#97d700', ink: '#141414' },
        success: { DEFAULT: '#2d6b46', soft: '#e7f2eb' },
        danger: { DEFAULT: '#a3352b', soft: '#fbecea' },
      },
      boxShadow: {
        'theme-sm': 'var(--shadow-sm)',
        'theme-md': 'var(--shadow-md)',
        'theme-lg': 'var(--shadow-lg)',
        toast: '0 18px 48px rgba(13,13,13,.18), 0 2px 8px rgba(13,13,13,.10)',
      },
      scale: { 98: '.98' },
      keyframes: {
        fadeInUp: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        flash: { '0%': { backgroundColor: 'var(--accent-soft)' }, '100%': { backgroundColor: 'transparent' } },
        lifebar: { '0%': { transform: 'scaleX(1)' }, '100%': { transform: 'scaleX(0)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-6px)' }, '40%,80%': { transform: 'translateX(6px)' } },
        livePulse: { '0%': { boxShadow: '0 0 0 0 rgba(179,122,0,.45)' }, '70%': { boxShadow: '0 0 0 7px rgba(179,122,0,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(179,122,0,0)' } },
      },
      animation: {
        'fade-in-up': 'fadeInUp .5s cubic-bezier(0.16,1,0.3,1) both',
        flash: 'flash 8s ease-out both',
        lifebar: 'lifebar linear forwards',
        shake: 'shake .4s cubic-bezier(.36,.07,.19,.97) both',
        'live-pulse': 'livePulse 2.4s ease-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
