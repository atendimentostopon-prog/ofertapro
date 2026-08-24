/** @type {import('tailwindcss').Config} */
export default {
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

        // ── Superfícies (light-first) ────────────────────────────────
        surface: {
          DEFAULT: '#FFFFFF',
          0: '#FFFFFF',   // canvas branco
          1: '#F6F7F9',   // cloud — seções secundárias
          2: '#F1F3F6',   // elevated sutil
          3: '#E7EAEE',   // hover
          4: '#D8DCE2',   // pressed
        },

        // ── Texto ─────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#101418',    // primary
          secondary: '#6B7280',  // slate
          tertiary: '#9CA3AF',
          inverse: '#FFFFFF',
          disabled: '#C0C5CE',
        },

        // ── Bordas / divisores ───────────────────────────────────────
        line: {
          DEFAULT: 'rgba(16, 20, 24, 0.08)',
          strong: 'rgba(16, 20, 24, 0.16)',
          subtle: 'rgba(16, 20, 24, 0.04)',
        },

        // ── Sinais ────────────────────────────────────────────────────
        success: {
          DEFAULT: '#22C078',
          bg: '#DFF8EE',
          ink: '#127046',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: '#FEF3C7',
          ink: '#92400E',
        },
        danger: {
          DEFAULT: '#EF4444',
          bg: '#FEE2E2',
          ink: '#991B1B',
        },
        info: {
          DEFAULT: '#3B82F6',
          bg: '#DBEAFE',
          ink: '#1E40AF',
        },

        // ── Legacy alias — brand.* redirecionado para mint ────────────
        // Mantém pages/componentes existentes funcionando com a cor Aflyo
        // até migração completa. Remover em cleanup final (Task #13).
        brand: {
          50:  '#F0FDF7',
          100: '#DFF8EE',
          200: '#B4EFD3',
          300: '#88E5B8',
          400: '#5EE7A5',
          500: '#5EE7A5',
          600: '#3DD98F',
          700: '#22C078',
          800: '#199A5F',
          900: '#127046',
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
        // Sombras minimalistas Aflyo — muito discretas
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
