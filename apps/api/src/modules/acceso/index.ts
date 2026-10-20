import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../../core/contexto';
import type { Guardias } from '../../core/auth';
import { rutasAuth } from './auth.routes';
import { rutasUsuarios } from './usuarios.routes';

export function moduloAcceso(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  rutasAuth(app, ctx, g);
  rutasUsuarios(app, ctx, g);
}
