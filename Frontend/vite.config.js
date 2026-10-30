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
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Big libraries get their own files: cached across deploys, downloaded in parallel, and only loaded where used
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'vendor-react';
          if (/node_modules[\/](react-router|react-router-dom|@remix-run)[\/]/.test(id)) return 'vendor-router';
          if (/node_modules[\/](framer-motion|motion-dom|motion-utils)[\/]/.test(id)) return 'vendor-motion';
          if (/node_modules[\/](firebase|@firebase)[\/]/.test(id)) return 'vendor-firebase';
          if (/node_modules[\/](@tanstack)[\/]/.test(id)) return 'vendor-query';
          if (/node_modules[\/](@react-google-maps|@googlemaps)[\/]/.test(id)) return 'vendor-maps';
          return undefined;
        },
      },
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
