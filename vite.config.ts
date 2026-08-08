import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built app can be dropped on any static host, opened from
// a file:// path, or served from a subdirectory on someone's own machine.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
