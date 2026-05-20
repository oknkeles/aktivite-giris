/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        ink: { DEFAULT: '#171232', 2: '#3F3766', 3: '#7B7399', 4: '#B8B0CC' },
        paper: { DEFAULT: '#FAF8FF', 2: '#F3EFFA', 3: '#E8E1F5', 4: '#D6CCEB' },
        brand: {
          indigo: '#6366F1',
          violet: '#A855F7',
          pink: '#EC4899',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#F43F5E',
          sky: '#0EA5E9',
          cyan: '#06B6D4',
        },
      },
      backgroundImage: {
        'grad-primary': 'linear-gradient(135deg, #6366F1 0%, #A855F7 50%, #EC4899 100%)',
        'grad-cool': 'linear-gradient(135deg, #06B6D4 0%, #6366F1 100%)',
        'grad-warm': 'linear-gradient(135deg, #F59E0B 0%, #EC4899 100%)',
        'grad-mint': 'linear-gradient(135deg, #10B981 0%, #0EA5E9 100%)',
      },
      boxShadow: {
        soft: '0 1px 3px rgba(23,18,50,.04), 0 1px 2px rgba(23,18,50,.06)',
        glow: '0 8px 24px rgba(99,102,241,.25)',
        pink: '0 8px 24px rgba(236,72,153,.25)',
      },
      animation: {
        'fade-in': 'fadeIn .3s ease-out',
        'pop': 'pop .4s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 6s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pop: { '0%': { transform: 'scale(.95)' }, '50%': { transform: 'scale(1.05)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
};
