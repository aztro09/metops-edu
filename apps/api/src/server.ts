import { buildApp } from './app';
import { leerEnv } from './core/env';

const env = leerEnv();
const { app } = await buildApp({ env });

const apagar = async (senal: string) => {
  app.log.info({ senal }, 'apagando');
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void apagar('SIGINT'));
process.on('SIGTERM', () => void apagar('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
