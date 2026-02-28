import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_TARGET || `http://localhost:${env.VITE_BACKEND_PORT || '3001'}`;

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@frontend/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
        '@frontend/organ': path.resolve(__dirname, 'packages/organ/src/index.ts'),
        '@frontend/composer': path.resolve(__dirname, 'packages/composer/src/index.ts'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-vue': ['vue', 'vue-router', 'pinia'],
            'vendor-dockview': ['dockview-core', 'dockview-vue'],
            'vendor-marked': ['marked', 'dompurify'],
          },
        },
      },
    },
  };
});
