import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Las pruebas de integración comparten una base de datos: se ejecutan una a la vez.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    setupFiles: ['./test/setup.ts'],
  },
});
