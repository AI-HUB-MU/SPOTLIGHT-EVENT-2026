import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deliberately minimal: no aliases, no extra plugins, no polyfills.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: true, // expose on LAN so you can open it on phones while testing
    port: 5173,
  },
});