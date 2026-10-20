import type { Prisma as PrismaNs } from '@prisma/client';
import {
  puede, transicionValida,
  type CrearTicketInput, type EstadoNombre, type Prioridad,
} from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import type { UsuarioSesion } from '../../core/auth';
import { AppError, conflicto, noEncontrado, prohibido, solicitudInvalida } from '../../core/errors';
import { auditar } from '../../core/auditoria';
import { registrarHistorial } from '../../core/historial';
import { esDuenoOPersonal, incluirLista, ticketLista } from './dto';

/** Folio por año: MO-2026-00001. El contador se incrementa de forma atómica dentro de la transacción. */
export async function siguienteFolio(tx: Pick<PrismaNs.TransactionClient, '$queryRaw'>) {
  const anio = new Date().getUTCFullYear();
  const filas = await tx.$queryRaw<{ ultimo: number }[]>`
    INSERT INTO folio_sequence (year, last_number) VALUES (${anio}, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = folio_sequence.last_number + 1
    RETURNING last_number AS ultimo`;
  return `MO-${anio}-${String(filas[0]!.ultimo).padStart(5, '0')}`;
}

// ---------------------------------------------------------------- Crear (RF-07, RF-08, RF-09)
export async function crearTicket(ctx: Ctx, u: UsuarioSesion, d: CrearTicketInput) {
  const { prisma, estados } = ctx;

  const [categoria, espacio] = await Promise.all([
    prisma.categoria.findUnique({ where: { id: d.categoriaId } }),
    prisma.espacio.findUnique({ where: { id: d.espacioId } }),
  ]);
  if (!categoria?.activa) throw solicitudInvalida('CATEGORIA_INVALIDA', 'La categoría no existe o está inactiva');
  if (!espacio?.activo) throw solicitudInvalida('ESPACIO_INVALIDO', 'El espacio no existe o está inactivo');
  if (d.equipoId) {
    const equipo = await prisma.equipo.findUnique({ where: { id: d.equipoId } });
    if (!equipo || equipo.espacioId !== d.espacioId) {
      throw solicitudInvalida('EQUIPO_INVALIDO', 'El equipo no pertenece al espacio indicado');
    }
  }

  // "Sumarme" a un incidente existente crea un ticket hijo vinculado al padre raíz (RN-07).
  let padreId: number | null = null;
  if (d.ticketPadreId) {
    const padre = await prisma.ticket.findUnique({ where: { id: d.ticketPadreId } });
    if (!padre) throw solicitudInvalida('PADRE_INVALIDO', 'El incidente al que quieres sumarte no existe');
    if (estados.nombre(padre.estadoId) === 'CERRADO') {
      throw solicitudInvalida('PADRE_CERRADO', 'Ese incidente ya está cerrado; crea uno nuevo');
    }
    padreId = padre.ticketPadreId ?? padre.id;
  }

  const prioridad = (d.prioridad ?? categoria.prioridadSugerida) as Prioridad;
  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.create({
      data: {
        folio: await siguienteFolio(tx), titulo: d.titulo, descripcion: d.descripcion,
        categoriaId: d.categoriaId, espacioId: d.espacioId, equipoId: d.equipoId ?? null,
        prioridad, estadoId: estados.id('ABIERTO'), reportanteId: u.id, ticketPadreId: padreId,
      },
    });
    await registrarHistorial(tx, {
      ticketId: t.id, usuarioId: u.id, accion: 'CREADO', estadoNuevoId: t.estadoId,
      detalle: padreId ? { ticketPadreId: padreId } : undefined,
    });
    return t;
  });

  ctx.metricas.ticketsCreados.inc();
  await ctx.bus.emit('ticket.creado', {
    ticketId: ticket.id, folio: ticket.folio, titulo: ticket.titulo, reportanteId: u.id, actorId: u.id,
  });
  return ticket;
}

// ---------------------------------------------------------------- Cambiar estado (RF-12, RF-15)
const FECHA_POR_ESTADO: Partial<Record<EstadoNombre, 'reconocidoAt' | 'resueltoAt' | 'cerradoAt'>> = {
  EN_PROCESO: 'reconocidoAt', RESUELTO: 'resueltoAt', CERRADO: 'cerradoAt',
};

/** Marcas de tiempo para MTTA/MTTR (RN-03, RN-04). `reconocidoAt` solo se fija la primera vez. */
function datosDeEstado(a: EstadoNombre, ticket: { reconocidoAt: Date | null }, ahora: Date) {
  const data: PrismaNs.TicketUncheckedUpdateManyInput = {};
  if (a === 'EN_PROCESO' && !ticket.reconocidoAt) data.reconocidoAt = ahora;
  if (a === 'RESUELTO') data.resueltoAt = ahora;
  if (a === 'CERRADO') data.cerradoAt = ahora;
  return data;
}

export async function cambiarEstado(ctx: Ctx, u: UsuarioSesion, ticketId: number, a: EstadoNombre) {
  const { prisma, estados } = ctx;
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!t) throw noEncontrado('Ticket no encontrado');
  if (!esDuenoOPersonal(u.roles, u.id, t.reportanteId)) throw noEncontrado('Ticket no encontrado');

  const de = estados.nombre(t.estadoId);
  const esAdmin = u.roles.includes('ADMINISTRADOR');

  if (a === 'CERRADO') {
    // Cierra el reportante (su propio ticket) o el administrador; el técnico no (matriz RBAC).
    const esDueno = t.reportanteId === u.id;
    if (!esAdmin && !esDueno) throw prohibido('Solo el reportante o un administrador puede cerrar el ticket');
  } else {
    if (!puede(u.roles, 'ticket:cambiar-estado')) throw prohibido();
    // D-07: un técnico solo cambia el estado de tickets asignados a él.
    if (!esAdmin && t.asignadoId !== u.id) throw prohibido('Solo puedes cambiar tickets asignados a ti');
  }
  if (!transicionValida(de, a)) {
    throw conflicto('TRANSICION_INVALIDA', `No se puede pasar de ${de} a ${a}`);
  }

  const ahora = new Date();
  const res = await prisma.$transaction(async (tx) => {
    // Bloqueo optimista: solo cambia si el estado sigue siendo el que leímos.
    const upd = await tx.ticket.updateMany({
      where: { id: t.id, estadoId: t.estadoId },
      data: { estadoId: estados.id(a), ...datosDeEstado(a, t, ahora) },
    });
    if (upd.count !== 1) throw conflicto('CONFLICTO_ESTADO', 'El ticket cambió mientras lo editabas; recarga e intenta de nuevo');
    await registrarHistorial(tx, {
      ticketId: t.id, usuarioId: u.id, accion: 'ESTADO',
      estadoAnteriorId: t.estadoId, estadoNuevoId: estados.id(a),
    });

    // RN-07: los tickets duplicados (hijos) heredan los cambios de estado del padre.
    const hijos = await tx.ticket.findMany({ where: { ticketPadreId: t.id } });
    const heredados: typeof hijos = [];
    for (const h of hijos) {
      const hDe = estados.nombre(h.estadoId);
      if (hDe === 'CERRADO' || hDe === a) continue;
      if (a === 'CERRADO' && hDe !== 'RESUELTO') continue;
      await tx.ticket.update({ where: { id: h.id }, data: { estadoId: estados.id(a), ...datosDeEstado(a, h, ahora) } });
      await registrarHistorial(tx, {
        ticketId: h.id, usuarioId: u.id, accion: 'ESTADO_HEREDADO',
        estadoAnteriorId: h.estadoId, estadoNuevoId: estados.id(a), detalle: { ticketPadreId: t.id },
      });
      heredados.push(h);
    }
    return { heredados };
  });

  await ctx.bus.emit('ticket.estado', {
    ticketId: t.id, folio: t.folio, de, a, actorId: u.id, reportanteId: t.reportanteId, asignadoId: t.asignadoId,
  });
  for (const h of res.heredados) {
    await ctx.bus.emit('ticket.estado', {
      ticketId: h.id, folio: h.folio, de: estados.nombre(h.estadoId), a, actorId: u.id,
      reportanteId: h.reportanteId, asignadoId: h.asignadoId,
    });
  }
}

// ---------------------------------------------------------------- Reabrir (RN-08)
export async function reabrirTicket(ctx: Ctx, u: UsuarioSesion, ticketId: number, motivo: string, ip?: string) {
  const { prisma, estados } = ctx;
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!t) throw noEncontrado('Ticket no encontrado');
  const de = estados.nombre(t.estadoId);
  if (de !== 'RESUELTO' && de !== 'CERRADO') throw conflicto('NO_REABRIBLE', 'Solo se puede reabrir un ticket resuelto o cerrado');

  await prisma.$transaction(async (tx) => {
    const upd = await tx.ticket.updateMany({
      where: { id: t.id, estadoId: t.estadoId },
      // Se limpian resuelto/cerrado para que el MTTR no cuente la solución anterior (D-03).
      data: { estadoId: estados.id('ABIERTO'), resueltoAt: null, cerradoAt: null },
    });
    if (upd.count !== 1) throw conflicto('CONFLICTO_ESTADO', 'El ticket cambió; recarga e intenta de nuevo');
    await registrarHistorial(tx, {
      ticketId: t.id, usuarioId: u.id, accion: 'REABIERTO',
      estadoAnteriorId: t.estadoId, estadoNuevoId: estados.id('ABIERTO'),
      detalle: { motivo, resueltoAtAnterior: t.resueltoAt?.toISOString() ?? null, cerradoAtAnterior: t.cerradoAt?.toISOString() ?? null },
    });
  });
  await auditar(ctx, { usuarioId: u.id, accion: 'TICKET_REABIERTO', entidad: 'ticket', entidadId: t.id, ip, detalle: { motivo } });
  await ctx.bus.emit('ticket.estado', {
    ticketId: t.id, folio: t.folio, de, a: 'ABIERTO', actorId: u.id, reportanteId: t.reportanteId, asignadoId: t.asignadoId,
  });
}

// ---------------------------------------------------------------- Priorizar / recategorizar (RF-14)
export async function actualizarTicket(
  ctx: Ctx, u: UsuarioSesion, ticketId: number, d: { prioridad?: Prioridad; categoriaId?: number },
) {
  const { prisma } = ctx;
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!t) throw noEncontrado('Ticket no encontrado');
  if (d.categoriaId) {
    const c = await prisma.categoria.findUnique({ where: { id: d.categoriaId } });
    if (!c?.activa) throw solicitudInvalida('CATEGORIA_INVALIDA', 'La categoría no existe o está inactiva');
  }
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id: t.id }, data: { prioridad: d.prioridad, categoriaId: d.categoriaId } });
    if (d.prioridad && d.prioridad !== t.prioridad) {
      await registrarHistorial(tx, { ticketId: t.id, usuarioId: u.id, accion: 'PRIORIDAD', detalle: { de: t.prioridad, a: d.prioridad } });
    }
    if (d.categoriaId && d.categoriaId !== t.categoriaId) {
      await registrarHistorial(tx, { ticketId: t.id, usuarioId: u.id, accion: 'CATEGORIA', detalle: { de: t.categoriaId, a: d.categoriaId } });
    }
  });
  await ctx.bus.emit('ticket.actualizado', { ticketId: t.id, campos: Object.keys(d), actorId: u.id });
}

// ---------------------------------------------------------------- Comentarios (RF-20)
export async function crearComentario(ctx: Ctx, u: UsuarioSesion, ticketId: number, contenido: string, esInterno: boolean) {
  const { prisma, estados } = ctx;
  const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!t || !esDuenoOPersonal(u.roles, u.id, t.reportanteId)) throw noEncontrado('Ticket no encontrado');
  if (esInterno && !puede(u.roles, 'ticket:nota-interna')) throw prohibido('Solo el personal puede escribir notas internas');
  if (estados.nombre(t.estadoId) === 'CERRADO') throw new AppError(409, 'TICKET_CERRADO', 'El ticket está cerrado');

  const c = await prisma.comentario.create({
    data: { ticketId, autorId: u.id, contenido, esInterno },
    include: { autor: { select: { nombre: true, apellidos: true } } },
  });
  const comentario = {
    id: c.id, ticketId, autorId: u.id, autorNombre: `${c.autor.nombre} ${c.autor.apellidos}`,
    contenido: c.contenido, esInterno: c.esInterno, creadoAt: c.creadoAt.toISOString(),
  };
  await ctx.bus.emit('comentario.creado', { comentario, folio: t.folio, reportanteId: t.reportanteId, asignadoId: t.asignadoId });
  return comentario;
}

// ---------------------------------------------------------------- Lectura
export { incluirLista, ticketLista };
