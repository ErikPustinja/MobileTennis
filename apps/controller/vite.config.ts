import { defineConfig } from 'vite';

// The controller is served from "<game base>c/" so both pages share one origin.
export default defineConfig({
  base: process.env.CONTROLLER_BASE_PATH ?? './',
  build: { target: 'es2022' },
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
