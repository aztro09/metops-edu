import type { Ctx } from '../../core/contexto';

/** Quién recibe qué aviso (RF-22, RF-23). Se genera desde los eventos del bus. */
export function registrarNotificaciones(ctx: Ctx) {
  const { prisma, bus } = ctx;

  async function notificar(
    destinatarios: (number | null | undefined)[],
    excluir: number,
    n: { tipo: string; mensaje: string; ticketId: number },
  ) {
    const ids = new Set(destinatarios.filter((x): x is number => typeof x === 'number' && x !== excluir));
    for (const usuarioId of ids) {
      const fila = await prisma.notificacion.create({
        data: { usuarioId, ticketId: n.ticketId, tipo: n.tipo, mensaje: n.mensaje.slice(0, 255) },
      });
      ctx.metricas.notificacionesEnviadas.inc();
      ctx.io?.to(`user:${usuarioId}`).emit('notification:new', {
        id: fila.id, tipo: fila.tipo, mensaje: fila.mensaje, ticketId: fila.ticketId, leida: false, creadoAt: fila.creadoAt,
      });
    }
  }

  const administradores = async () =>
    (await prisma.usuario.findMany({
      where: { activo: true, roles: { some: { rol: { nombre: 'ADMINISTRADOR' } } } }, select: { id: true },
    })).map((a) => a.id);

  bus.on('ticket.creado', async (e) => {
    await notificar(await administradores(), e.actorId, {
      tipo: 'TICKET_NUEVO', ticketId: e.ticketId, mensaje: `Nuevo ticket ${e.folio}: ${e.titulo}`,
    });
  });

  bus.on('ticket.asignado', async (e) => {
    await notificar([e.tecnicoId], e.actorId, { tipo: 'ASIGNADO', ticketId: e.ticketId, mensaje: `Se te asignó el ticket ${e.folio}` });
    await notificar([e.reportanteId], e.actorId, { tipo: 'ASIGNADO', ticketId: e.ticketId, mensaje: `Tu ticket ${e.folio} ya tiene un técnico asignado` });
  });

  bus.on('ticket.estado', async (e) => {
    await notificar([e.reportanteId, e.asignadoId], e.actorId, {
      tipo: 'ESTADO', ticketId: e.ticketId, mensaje: `El ticket ${e.folio} pasó de ${e.de} a ${e.a}`,
    });
  });

  bus.on('ticket.escalado', async (e) => {
    await notificar(await administradores(), e.actorId, {
      tipo: 'ESCALADO', ticketId: e.ticketId, mensaje: `Ticket ${e.folio} escalado: ${e.motivo}`,
    });
  });

  bus.on('comentario.creado', async ({ comentario: c, folio, reportanteId, asignadoId }) => {
    // Las notas internas solo avisan al personal; los comentarios normales, a la otra parte.
    const destinos = c.esInterno ? [asignadoId] : [reportanteId, asignadoId];
    await notificar(destinos, c.autorId, {
      tipo: 'COMENTARIO', ticketId: c.ticketId, mensaje: `${c.autorNombre} comentó en ${folio}`,
    });
  });
}
