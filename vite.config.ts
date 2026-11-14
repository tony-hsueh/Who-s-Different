import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backend = `http://127.0.0.1:${process.env.PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    host: true,
    proxy: {
      '/socket.io': { target: backend, ws: true },
      '/healthz': backend,
    },
  },
});
