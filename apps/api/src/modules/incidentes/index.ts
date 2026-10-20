import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../../core/contexto';
import type { Guardias } from '../../core/auth';
import { rutasTickets } from './tickets.routes';
import { rutasEvidencias } from './evidencias.routes';
import { rutasResumen } from './resumen.routes';

export function moduloIncidentes(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  rutasTickets(app, ctx, g);
  rutasEvidencias(app, ctx, g);
  rutasResumen(app, ctx, g);
}
