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
  },
});
