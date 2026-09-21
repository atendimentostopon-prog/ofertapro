import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const adminApi = new URL(env.VITE_ADMIN_API_URL);

  return {
    plugins: [react()],
    server: {
      port: 5273,
      strictPort: true,
      proxy: {
        '/admin-api': {
          target: adminApi.origin,
          changeOrigin: true,
          rewrite: () => adminApi.pathname,
        },
      },
    },
  };
});
