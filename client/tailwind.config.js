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
        ink: { DEFAULT: '#0F172A', 2: '#334155', 3: '#64748B', 4: '#94A3B8' },
        paper: { DEFAULT: '#F8FAFC', 2: '#F1F5F9', 3: '#E2E8F0', 4: '#CBD5E1' },
        brand: {
          indigo: '#2563EB',
          violet: '#1E40AF',
          pink: '#0891B2',
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#E11D48',
          sky: '#0EA5E9',
          cyan: '#06B6D4',
        },
      },
      backgroundImage: {
        'grad-primary': 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 50%, #0891B2 100%)',
        'grad-cool': 'linear-gradient(135deg, #06B6D4 0%, #2563EB 100%)',
        'grad-warm': 'linear-gradient(135deg, #2563EB 0%, #0891B2 100%)',
        'grad-mint': 'linear-gradient(135deg, #10B981 0%, #0EA5E9 100%)',
      },
      boxShadow: {
        soft: '0 1px 3px rgba(15,23,42,.04), 0 1px 2px rgba(15,23,42,.06)',
        glow: '0 8px 24px rgba(37,99,235,.25)',
        pink: '0 8px 24px rgba(8,145,178,.25)',
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
