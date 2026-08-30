import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, '../shared') } },
  // shared/ e irmao de admin/, fora do root do Vitest: liberar leitura.
  server: { fs: { allow: [resolve(__dirname, '..')] } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '../shared/**/*.test.ts'],
    // env.ts valida essas vars no load; valores ficticios so pra suite (os
    // testes exercitam funcoes puras, nunca chamam Supabase/rede de verdade).
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      VITE_ADMIN_API_URL: 'https://test.supabase.co/functions/v1/admin-api',
      VITE_ADMIN_HOSTNAME: 'admin.aflyo.com.br',
    },
  },
});
