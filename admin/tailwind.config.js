/** @type {import('tailwindcss').Config} */
// Copia verbatim de d:\ofertapro\tailwind.config.js (theme.extend). Ver nota no
// fim da Task 9 do plano: unificar os dois configs e chore pos-SP1.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '480px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        graphite: {
          DEFAULT: '#101418',
          50:  '#F5F6F7',
          100: '#E7E9EB',
          200: '#C7CBD1',
          300: '#9AA1AA',
          400: '#6B7280',
          500: '#4B5259',
          600: '#2F343B',
          700: '#1F2328',
          800: '#151A1F',
          900: '#101418',
        },
        cloud: '#F6F7F9',
        mint: {
          DEFAULT: '#5EE7A5',
          50:  '#F0FDF7',
          100: '#DFF8EE',
          200: '#B4EFD3',
          300: '#88E5B8',
          400: '#5EE7A5',
          500: '#3DD98F',
          600: '#22C078',
          700: '#199A5F',
          800: '#127046',
          900: '#0A4D30',
        },
        ice: '#DFF8EE',
        surface: {
          DEFAULT: 'var(--surface-0)',
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          secondary: 'var(--ink-secondary)',
          tertiary: 'var(--ink-tertiary)',
          inverse: 'var(--ink-inverse)',
          disabled: 'var(--ink-disabled)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
          subtle: 'var(--line-subtle)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          bg: 'rgb(var(--success-bg) / <alpha-value>)',
          ink: 'rgb(var(--success-ink) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          bg: 'rgb(var(--warning-bg) / <alpha-value>)',
          ink: 'rgb(var(--warning-ink) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          bg: 'rgb(var(--danger-bg) / <alpha-value>)',
          ink: 'rgb(var(--danger-ink) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          bg: 'rgb(var(--info-bg) / <alpha-value>)',
          ink: 'rgb(var(--info-ink) / <alpha-value>)',
        },
      },
      borderRadius: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
        '2.5xl': '24px',
        '3xl': '28px',
      },
      boxShadow: {
        'xs':    '0 1px 2px 0 rgba(16, 20, 24, 0.04)',
        'sm':    '0 1px 3px 0 rgba(16, 20, 24, 0.06), 0 1px 2px -1px rgba(16, 20, 24, 0.04)',
        'DEFAULT':'0 2px 6px -1px rgba(16, 20, 24, 0.06), 0 1px 3px -1px rgba(16, 20, 24, 0.04)',
        'md':    '0 4px 12px -2px rgba(16, 20, 24, 0.08), 0 2px 4px -2px rgba(16, 20, 24, 0.04)',
        'lg':    '0 12px 24px -6px rgba(16, 20, 24, 0.10), 0 4px 8px -4px rgba(16, 20, 24, 0.06)',
        'xl':    '0 24px 48px -12px rgba(16, 20, 24, 0.12)',
        'card':  '0 1px 2px 0 rgba(16, 20, 24, 0.04), 0 1px 3px -1px rgba(16, 20, 24, 0.06)',
        'focus': '0 0 0 3px rgba(94, 231, 165, 0.28)',
        'focus-ink': '0 0 0 3px rgba(16, 20, 24, 0.12)',
      },
      transitionTimingFunction: {
        'aflyo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '160': '160ms',
        '220': '220ms',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-delay': 'float 6s ease-in-out infinite 2s',
        'gradient-shift': 'gradientShift 8s ease infinite',
        'fade-in': 'fadeIn 0.35s ease-out',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'shake': 'shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both',
      },
      keyframes: {
        shake: {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
