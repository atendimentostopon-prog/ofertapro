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
        surface: {
          DEFAULT: 'var(--surface-0)',
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)',
        },

        // ── Texto ─────────────────────────────────────────────────────
        ink: {
          DEFAULT: 'var(--ink-primary)',
          secondary: 'var(--ink-secondary)',
          tertiary: 'var(--ink-tertiary)',
          inverse: 'var(--ink-inverse)',
          disabled: 'var(--ink-disabled)',
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
          bg: 'var(--success-bg)',
          ink: 'var(--success-ink)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: 'var(--warning-bg)',
          ink: 'var(--warning-ink)',
        },
        danger: {
          DEFAULT: '#EF4444',
          bg: 'var(--danger-bg)',
          ink: 'var(--danger-ink)',
        },
        info: {
          DEFAULT: '#3B82F6',
          bg: 'var(--info-bg)',
          ink: 'var(--info-ink)',
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
