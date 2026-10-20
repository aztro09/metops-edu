import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Carga ADMIN_CORREO / ADMIN_PASSWORD del .env para que el E2E use el mismo administrador que el seed.
if (existsSync('.env')) process.loadEnvFile('.env');

// Las pruebas E2E usan los usuarios de demostración que crea `pnpm --filter @metops/api db:seed` (solo en desarrollo).
// Con `pnpm dev` ya levantado, reutiliza los servidores; si no, los arranca.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    // En un entorno sin descarga de navegadores puedes apuntar a uno ya instalado: PW_CHROMIUM_PATH=ruta
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ['--no-sandbox'] }
      : {},
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
