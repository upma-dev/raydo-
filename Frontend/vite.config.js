import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@food/api/axios': path.resolve(__dirname, './src/services/api/axios.js'),
      '@food/api/config': path.resolve(__dirname, './src/services/api/config.js'),
      '@food/api': path.resolve(__dirname, './src/services/api'),
      '@food': path.resolve(__dirname, './src/modules/Food'),
      '@delivery': path.resolve(__dirname, './src/modules/DeliveryV2'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
