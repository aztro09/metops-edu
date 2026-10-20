import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { leerEnv, type Env } from './core/env';
import { CatalogoEstados, crearPrisma, type Prisma } from './core/db';
import { Bus } from './core/eventos';
import { LocalStorage, type StorageProvider } from './core/storage';
import { crearMetricas, registrarMetricasHttp } from './core/metricas';
import { registrarManejadorErrores } from './core/errors';
import { crearGuardias } from './core/auth';
import type { Ctx } from './core/contexto';
import { moduloAcceso } from './modules/acceso';
import { moduloCatalogos } from './modules/catalogos';
import { moduloIncidentes } from './modules/incidentes';
import { moduloAsignacion } from './modules/asignacion';
import { moduloComunicacion } from './modules/comunicacion';
import { moduloReportes } from './modules/reportes';

export interface OpcionesApp {
  env?: Env;
  prisma?: Prisma;
  storage?: StorageProvider;
}

export async function buildApp(op: OpcionesApp = {}) {
  const env = op.env ?? leerEnv();
  const prisma = op.prisma ?? crearPrisma(env.DATABASE_URL);
  const estados = await CatalogoEstados.cargar(prisma);

  const app = Fastify({
    trustProxy: true, // detrás de Caddy: IP real y protocolo correcto
    bodyLimit: 1024 * 1024,
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
          },
  });

  const bus = new Bus((err, evento) => app.log.error({ err, evento }, 'error en un escucha de eventos'));
  const metricas = crearMetricas(prisma, (id) => estados.nombre(id));
  const ctx: Ctx = {
    env, prisma, estados, bus, metricas, io: null,
    storage: op.storage ?? new LocalStorage(env.EVIDENCE_DIR),
  };

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
  app.decorateRequest('usuario', null);
  registrarManejadorErrores(app);
  registrarMetricasHttp(app, metricas);

  app.get('/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { estado: 'ok' };
    } catch {
      return reply.status(503).send({ estado: 'error' });
    }
  });

  const g = crearGuardias(ctx);
  await app.register(
    async (api) => {
      moduloAcceso(api, ctx, g);
      moduloCatalogos(api, ctx, g);
      moduloIncidentes(api, ctx, g);
      moduloAsignacion(api, ctx, g);
      moduloReportes(api, ctx, g);
    },
    { prefix: '/api' },
  );
  moduloComunicacion(app, ctx);

  app.addHook('onClose', async () => {
    ctx.io?.close();
    await prisma.$disconnect();
  });

  return { app, ctx };
}
