import type { Prisma as PrismaNs } from '@prisma/client';
import type { Rol } from '@metops/shared';
import { esPersonal } from '@metops/shared';
import type { UsuarioSesion } from '../../core/auth';

export const incluirLista = {
  estado: true,
  categoria: { select: { id: true, nombre: true } },
  espacio: { select: { id: true, codigo: true, nombre: true, edificio: { select: { codigo: true } } } },
  reportante: { select: { id: true, nombre: true, apellidos: true } },
  asignado: { select: { id: true, nombre: true, apellidos: true } },
} satisfies PrismaNs.TicketInclude;

type TicketLista = PrismaNs.TicketGetPayload<{ include: typeof incluirLista }>;

const nombreCompleto = (u: { nombre: string; apellidos: string } | null) =>
  u ? { ...u, nombreCompleto: `${u.nombre} ${u.apellidos}` } : null;

export function ticketLista(t: TicketLista) {
  return {
    id: t.id, folio: t.folio, titulo: t.titulo, prioridad: t.prioridad,
    estado: t.estado.nombre, categoria: t.categoria, espacio: t.espacio,
    reportante: nombreCompleto(t.reportante), asignado: nombreCompleto(t.asignado),
    ticketPadreId: t.ticketPadreId, creadoAt: t.creadoAt, actualizadoAt: t.actualizadoAt,
  };
}

/** RN-05: el alumno/docente solo ve sus tickets; el personal ve todos. */
export const dondeVisible = (u: UsuarioSesion): PrismaNs.TicketWhereInput =>
  esPersonal(u.roles) ? {} : { reportanteId: u.id };

export const esDuenoOPersonal = (roles: Rol[], userId: number, reportanteId: number) =>
  esPersonal(roles) || reportanteId === userId;
