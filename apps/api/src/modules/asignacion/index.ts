import type { FastifyInstance } from 'fastify';
import { asignarSchema, escalarSchema, PRIORIDADES, type Prioridad } from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import { sesion, type Guardias } from '../../core/auth';
import { conflicto, noEncontrado, prohibido, solicitudInvalida } from '../../core/errors';
import { registrarHistorial } from '../../core/historial';

const idParam = (req: { params: unknown }) => Number((req.params as { id: string }).id);

/** RF-13 y RF-19: asignar, tomar y escalar tickets. */
export function moduloAsignacion(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  const { prisma, estados } = ctx;

  // ---------- Asignar / reasignar (solo administrador) ----------
  app.patch('/tickets/:id/asignacion', { preHandler: [g.autenticar, g.permiso('ticket:asignar')] }, async (req) => {
    const u = sesion(req);
    const { tecnicoId } = asignarSchema.parse(req.body);
    const t = await prisma.ticket.findUnique({ where: { id: idParam(req) } });
    if (!t) throw noEncontrado('Ticket no encontrado');
    const estado = estados.nombre(t.estadoId);
    if (estado === 'CERRADO' || estado === 'RESUELTO') throw conflicto('TICKET_FINALIZADO', 'El ticket ya está resuelto o cerrado');

    const tecnico = await prisma.usuario.findFirst({
      where: { id: tecnicoId, activo: true, roles: { some: { rol: { nombre: { in: ['TECNICO', 'ADMINISTRADOR'] } } } } },
    });
    if (!tecnico) throw solicitudInvalida('TECNICO_INVALIDO', 'El usuario no existe, está inactivo o no es personal técnico');

    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: t.id }, data: { asignadoId: tecnico.id } });
      await registrarHistorial(tx, { ticketId: t.id, usuarioId: u.id, accion: 'ASIGNADO', asignadoAnteriorId: t.asignadoId, asignadoNuevoId: tecnico.id });
    });
    await ctx.bus.emit('ticket.asignado', { ticketId: t.id, folio: t.folio, tecnicoId: tecnico.id, actorId: u.id, reportanteId: t.reportanteId });
    return { ok: true };
  });

  // ---------- Tomar un ticket sin asignar (atómico: si dos técnicos lo intentan, solo uno gana) ----------
  app.post('/tickets/:id/tomar', { preHandler: [g.autenticar, g.permiso('ticket:tomar')] }, async (req) => {
    const u = sesion(req);
    const id = idParam(req);
    const ahora = new Date();

    const resultado = await prisma.$transaction(async (tx) => {
      // Caso 1: ticket ABIERTO sin dueño -> se asigna y pasa a EN_PROCESO (primer reconocimiento, RN-03).
      const a = await tx.ticket.updateMany({
        where: { id, asignadoId: null, estadoId: estados.id('ABIERTO') },
        data: { asignadoId: u.id, estadoId: estados.id('EN_PROCESO'), reconocidoAt: ahora },
      });
      if (a.count === 1) {
        await registrarHistorial(tx, { ticketId: id, usuarioId: u.id, accion: 'ASIGNADO', asignadoNuevoId: u.id });
        await registrarHistorial(tx, { ticketId: id, usuarioId: u.id, accion: 'ESTADO', estadoAnteriorId: estados.id('ABIERTO'), estadoNuevoId: estados.id('EN_PROCESO') });
        return 'ABIERTO' as const;
      }
      // Caso 2: en proceso o pendiente pero sin dueño (por ejemplo, tras escalar): solo se asigna.
      const b = await tx.ticket.updateMany({
        where: { id, asignadoId: null, estadoId: { in: [estados.id('EN_PROCESO'), estados.id('PENDIENTE')] } },
        data: { asignadoId: u.id },
      });
      if (b.count === 1) {
        await registrarHistorial(tx, { ticketId: id, usuarioId: u.id, accion: 'ASIGNADO', asignadoNuevoId: u.id });
        return 'OTRO' as const;
      }
      return null;
    });

    if (!resultado) {
      const t = await prisma.ticket.findUnique({ where: { id } });
      if (!t) throw noEncontrado('Ticket no encontrado');
      const e = estados.nombre(t.estadoId);
      if (e === 'RESUELTO' || e === 'CERRADO') throw conflicto('TICKET_FINALIZADO', 'El ticket ya está resuelto o cerrado');
      throw conflicto('YA_ASIGNADO', 'Otro técnico ya tomó este ticket');
    }
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    await ctx.bus.emit('ticket.asignado', { ticketId: id, folio: t.folio, tecnicoId: u.id, actorId: u.id, reportanteId: t.reportanteId });
    if (resultado === 'ABIERTO') {
      await ctx.bus.emit('ticket.estado', { ticketId: id, folio: t.folio, de: 'ABIERTO', a: 'EN_PROCESO', actorId: u.id, reportanteId: t.reportanteId, asignadoId: u.id });
    }
    return { ok: true };
  });

  // ---------- Escalar (RF-19): sube la prioridad, libera el ticket y avisa a los administradores ----------
  app.post('/tickets/:id/escalar', { preHandler: [g.autenticar, g.permiso('ticket:escalar')] }, async (req) => {
    const u = sesion(req);
    const { motivo } = escalarSchema.parse(req.body);
    const t = await prisma.ticket.findUnique({ where: { id: idParam(req) } });
    if (!t) throw noEncontrado('Ticket no encontrado');
    const estado = estados.nombre(t.estadoId);
    if (estado === 'RESUELTO' || estado === 'CERRADO') throw conflicto('TICKET_FINALIZADO', 'El ticket ya está resuelto o cerrado');
    if (!u.roles.includes('ADMINISTRADOR') && t.asignadoId !== u.id) throw prohibido('Solo puedes escalar tickets asignados a ti');

    const indice = PRIORIDADES.indexOf(t.prioridad as Prioridad);
    const nueva = PRIORIDADES[Math.min(indice + 1, PRIORIDADES.length - 1)]!;
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: t.id }, data: { prioridad: nueva, asignadoId: null } });
      await registrarHistorial(tx, {
        ticketId: t.id, usuarioId: u.id, accion: 'ESCALADO', asignadoAnteriorId: t.asignadoId,
        detalle: { motivo, prioridadAnterior: t.prioridad, prioridadNueva: nueva },
      });
    });
    await ctx.bus.emit('ticket.escalado', { ticketId: t.id, folio: t.folio, actorId: u.id, motivo });
    return { ok: true, prioridad: nueva };
  });
}
