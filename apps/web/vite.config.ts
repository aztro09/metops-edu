import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// El navegador habla siempre con un solo origen (http://localhost:5173).
// Vite reenvía /api y /socket.io al backend, igual que hará Caddy en producción: sin CORS.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
  test: { environment: 'jsdom', globals: false },
});
