import { defineConfig } from 'tsup';

export default defineConfig({
  // server.js = el api; seed.js = crea catálogos y el administrador inicial (se ejecuta en producción sin tsx).
  entry: { server: 'src/server.ts', seed: 'prisma/seed.ts' },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Incluye el paquete compartido (está en TypeScript) dentro del bundle.
  noExternal: ['@metops/shared'],
});
