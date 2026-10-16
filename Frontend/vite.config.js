import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Production builds carry no console.log / info / debug at all (warn / error stay, and are redacted at runtime)
  esbuild: mode === 'production' ? { pure: ['console.log', 'console.info', 'console.debug'] } : {},
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
    proxy: {
      '/api/v1': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Socket.IO shares the API origin in dev (VITE_API_BASE_URL is relative), so it must be proxied too
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      }
    }
  },
}));
