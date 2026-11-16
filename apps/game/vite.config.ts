import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { templateCompilerOptions } from '@tresjs/core';

// BASE_PATH is set by the deploy workflow (e.g. "/MobileTennis/") so assets resolve on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue({ ...templateCompilerOptions })],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
