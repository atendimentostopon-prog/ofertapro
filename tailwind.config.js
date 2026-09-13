/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Breakpoint "phablet" -- usado no grid de métricas do Dashboard
        // (grid-cols-2 antes do sm: padrão de 640px). Nunca tinha sido
        // definido, então `xs:` no código não gerava CSS nenhum.
        xs: '480px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Aflyo core ────────────────────────────────────────────────
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

        // ── Superfícies (light-first, valores reais em index.css :root/.dark) ──
        // Formato rgb(var(--x-rgb) / <alpha-value>): o Tailwind consegue
        // parsear e combinar com modificadores de opacidade (bg-surface-0/85).
        // Um `var(--x)` cru nao gera CSS nenhum quando tem /NN.
        surface: {
          DEFAULT: 'rgb(var(--surface-0-rgb) / <alpha-value>)',
          0: 'rgb(var(--surface-0-rgb) / <alpha-value>)',
          1: 'rgb(var(--surface-1-rgb) / <alpha-value>)',
          2: 'rgb(var(--surface-2-rgb) / <alpha-value>)',
          3: 'rgb(var(--surface-3-rgb) / <alpha-value>)',
          4: 'rgb(var(--surface-4-rgb) / <alpha-value>)',
        },

        // ── Texto ─────────────────────────────────────────────────────
        ink: {
          DEFAULT: 'rgb(var(--ink-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary-rgb) / <alpha-value>)',
          tertiary: 'rgb(var(--ink-tertiary-rgb) / <alpha-value>)',
          inverse: 'rgb(var(--ink-inverse-rgb) / <alpha-value>)',
          disabled: 'rgb(var(--ink-disabled-rgb) / <alpha-value>)',
        },

        // ── Bordas / divisores ───────────────────────────────────────
        line: {
          DEFAULT: 'var(--line-default)',
          strong: 'var(--line-strong)',
          subtle: 'var(--line-subtle)',
        },

        // ── Sinais (DEFAULT fixo — cor de marca não muda; bg/ink via var) ──
        success: {
          DEFAULT: '#22C078',
          bg: 'rgb(var(--success-bg-rgb) / <alpha-value>)',
          ink: 'rgb(var(--success-ink-rgb) / <alpha-value>)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: 'rgb(var(--warning-bg-rgb) / <alpha-value>)',
          ink: 'rgb(var(--warning-ink-rgb) / <alpha-value>)',
        },
        danger: {
          DEFAULT: '#EF4444',
          bg: 'rgb(var(--danger-bg-rgb) / <alpha-value>)',
          ink: 'rgb(var(--danger-ink-rgb) / <alpha-value>)',
        },
        info: {
          DEFAULT: '#3B82F6',
          bg: 'rgb(var(--info-bg-rgb) / <alpha-value>)',
          ink: 'rgb(var(--info-ink-rgb) / <alpha-value>)',
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
        // Sombras minimalistas Aflyo — valores reais em index.css :root/.dark
        'xs':    'var(--shadow-xs)',
        'sm':    'var(--shadow-sm)',
        'DEFAULT':'var(--shadow-sm)',
        'md':    'var(--shadow-md)',
        'lg':    'var(--shadow-lg)',
        'xl':    'var(--shadow-lg)',
        'card':  'var(--shadow-xs)',
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
      },
      keyframes: {
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
}
