import type { Prisma as PrismaNs } from '@prisma/client';
import type { ListarTicketsInput } from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import type { UsuarioSesion } from '../../core/auth';
import { dondeVisible } from './dto';

/** Construye el WHERE del listado: visibilidad por rol (RN-05) + filtros del usuario (RF-10). */
export function construirWhere(ctx: Ctx, u: UsuarioSesion, f: ListarTicketsInput): PrismaNs.TicketWhereInput {
  const and: PrismaNs.TicketWhereInput[] = [dondeVisible(u)];
  if (f.estado) and.push({ estadoId: ctx.estados.id(f.estado) });
  if (f.prioridad) and.push({ prioridad: f.prioridad });
  if (f.categoriaId) and.push({ categoriaId: f.categoriaId });
  if (f.espacioId) and.push({ espacioId: f.espacioId });
  if (f.asignadoId) and.push({ asignadoId: f.asignadoId });
  if (f.sinAsignar === 'true') and.push({ asignadoId: null });
  if (f.mios === 'true') and.push({ reportanteId: u.id });
  if (f.desde) and.push({ creadoAt: { gte: f.desde } });
  if (f.hasta) and.push({ creadoAt: { lte: f.hasta } });
  if (f.q) {
    and.push({
      OR: [
        { folio: { contains: f.q, mode: 'insensitive' } },
        { titulo: { contains: f.q, mode: 'insensitive' } },
      ],
    });
  }
  return { AND: and };
}
