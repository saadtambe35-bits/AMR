/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: '#07080B',
        obsidian: '#0D1117',
        surface: {
          DEFAULT: '#0D1117',
          subtle: '#121722',
          well: '#141822',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.07)',
          DEFAULT: 'rgba(255, 255, 255, 0.1)',
          highlight: 'rgba(255, 255, 255, 0.15)',
        },
        slate: {
          850: '#141822',
          900: '#0F1218',
          950: '#07080B',
        },
        neon: {
          emerald: '#10B981',
          amber: '#F59E0B',
          rose: '#EF4444',
          sky: '#0EA5E9',
          indigo: '#6366F1',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.02em',
      },
      boxShadow: {
        'top-highlight': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.12)',
        'well-inset': 'inset 0 2px 4px rgba(0, 0, 0, 0.45)',
        'neon-emerald': '0 0 12px rgba(16, 185, 129, 0.4), 0 0 2px #10B981',
        'neon-indigo': '0 0 16px rgba(99, 102, 241, 0.35)',
        'neon-rose': '0 0 16px rgba(239, 68, 68, 0.35)',
      },
      animation: {
        'chip-breathe': 'chipBreathe 3s ease-in-out infinite',
        'shimmer': 'shimmerSweep 2.5s infinite',
        'neon-pulse': 'neonPulse 2s ease-in-out infinite',
      },
      keyframes: {
        chipBreathe: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.85' },
          '50%': { transform: 'scale(1.25)', opacity: '1' },
        },
        shimmerSweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        neonPulse: {
          '0%, 100%': { opacity: '0.9' },
          '50%': { opacity: '0.4' },
        }
      }
    },
  },
  plugins: [],
}
