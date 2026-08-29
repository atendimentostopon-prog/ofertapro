// Cópia fiel de tailwind.config.js do app raiz (2026-08-29). Fonte para o
// tailwind.config.js de admin/. Unificar os dois configs e um chore futuro.
export const tokens = {
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
      DEFAULT: '#FFFFFF',
      0: '#FFFFFF',   // canvas branco
      1: '#F6F7F9',   // cloud — seções secundárias
      2: '#F1F3F6',   // elevated sutil
      3: '#E7EAEE',   // hover
      4: '#D8DCE2',   // pressed
    },
    ink: {
      DEFAULT: '#101418',    // primary
      secondary: '#6B7280',  // slate
      tertiary: '#9CA3AF',
      inverse: '#FFFFFF',
      disabled: '#C0C5CE',
    },
    line: {
      DEFAULT: 'rgba(16, 20, 24, 0.08)',
      strong: 'rgba(16, 20, 24, 0.16)',
      subtle: 'rgba(16, 20, 24, 0.04)',
    },
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
  },
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
  },
} as const;
