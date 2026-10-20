import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { esPersonal } from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import { crearGuardias, sesion, type UsuarioSesion } from '../../core/auth';
import { AppError, noEncontrado } from '../../core/errors';
import { verificarAcceso } from '../../core/seguridad';
import { crearComentario } from '../incidentes/tickets.servicio';
import { esDuenoOPersonal } from '../incidentes/dto';
import { registrarNotificaciones } from './notificaciones';

const unirSchema = z.object({ ticketId: z.number().int().positive(), desdeId: z.number().int().min(0).optional() });
const mensajeSchema = z.object({
  ticketId: z.number().int().positive(),
  contenido: z.string().trim().min(1).max(2000),
  esInterno: z.boolean().default(false),
});

type Ack = (r: unknown) => void;
const errorAck = (e: unknown) =>
  e instanceof AppError
    ? { ok: false, error: { codigo: e.codigo, mensaje: e.message } }
    : e instanceof z.ZodError
      ? { ok: false, error: { codigo: 'VALIDACION', mensaje: 'Datos inválidos' } }
      : { ok: false, error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } };

export function moduloComunicacion(app: FastifyInstance, ctx: Ctx) {
  const { prisma } = ctx;
  const g = crearGuardias(ctx);

  // ---------------------------------------------------------------- REST: bandeja de notificaciones (RF-23)
  app.get('/api/notificaciones', { preHandler: [g.autenticar] }, async (req) => {
    const u = sesion(req);
    const q = req.query as { soloNoLeidas?: string };
    const [items, noLeidas] = await Promise.all([
      prisma.notificacion.findMany({
        where: { usuarioId: u.id, ...(q.soloNoLeidas === 'true' ? { leida: false } : {}) },
        orderBy: { id: 'desc' }, take: 50,
      }),
      prisma.notificacion.count({ where: { usuarioId: u.id, leida: false } }),
    ]);
    return { items, noLeidas };
  });
  app.post('/api/notificaciones/leer-todas', { preHandler: [g.autenticar] }, async (req) => {
    await prisma.notificacion.updateMany({ where: { usuarioId: sesion(req).id, leida: false }, data: { leida: true } });
    return { ok: true };
  });
  app.post('/api/notificaciones/:id/leer', { preHandler: [g.autenticar] }, async (req) => {
    const r = await prisma.notificacion.updateMany({
      where: { id: Number((req.params as { id: string }).id), usuarioId: sesion(req).id }, data: { leida: true },
    });
    if (r.count === 0) throw noEncontrado('Notificación no encontrada');
    return { ok: true };
  });

  // ---------------------------------------------------------------- WebSocket (Socket.IO en el mismo servidor HTTP)
  const io = new Server(app.server, { path: '/socket.io', serveClient: false });
  ctx.io = io;

  /** Presencia en memoria: ticketId -> (socketId -> usuario). Válido mientras haya una sola instancia del api. */
  const presencia = new Map<number, Map<string, { usuarioId: number; nombre: string }>>();
  const listaPresentes = (ticketId: number) => {
    const unicos = new Map<number, string>();
    for (const p of presencia.get(ticketId)?.values() ?? []) unicos.set(p.usuarioId, p.nombre);
    return [...unicos].map(([usuarioId, nombre]) => ({ usuarioId, nombre }));
  };
  const salirDeSala = (socket: Socket, ticketId: number) => {
    socket.leave(`ticket:${ticketId}`);
    socket.leave(`ticket:${ticketId}:staff`);
    const sala = presencia.get(ticketId);
    if (sala?.delete(socket.id)) {
      if (sala.size === 0) presencia.delete(ticketId);
      io.to(`ticket:${ticketId}`).emit('presence:update', { ticketId, presentes: listaPresentes(ticketId) });
    }
  };

  // Autenticación del handshake con el mismo JWT de acceso.
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) throw new Error('sin token');
      const c = await verificarAcceso(ctx.env.JWT_SECRET, token);
      socket.data.usuario = { id: c.sub, roles: c.roles } satisfies UsuarioSesion;
      next();
    } catch {
      next(new Error('NO_AUTENTICADO'));
    }
  });

  io.on('connection', (socket) => {
    const u = socket.data.usuario as UsuarioSesion;
    ctx.metricas.wsConexiones.inc();
    socket.join(`user:${u.id}`);

    socket.on('ticket:join', async (payload: unknown, ack?: Ack) => {
      try {
        const { ticketId, desdeId } = unirSchema.parse(payload);
        const t = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { reportanteId: true } });
        if (!t || !esDuenoOPersonal(u.roles, u.id, t.reportanteId)) throw noEncontrado('Ticket no encontrado');
        const personal = esPersonal(u.roles);

        socket.join(`ticket:${ticketId}`);
        if (personal) socket.join(`ticket:${ticketId}:staff`);
        const yo = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id }, select: { nombre: true, apellidos: true } });
        const sala = presencia.get(ticketId) ?? new Map();
        sala.set(socket.id, { usuarioId: u.id, nombre: `${yo.nombre} ${yo.apellidos}` });
        presencia.set(ticketId, sala);
        io.to(`ticket:${ticketId}`).emit('presence:update', { ticketId, presentes: listaPresentes(ticketId) });

        // Mensajes que se perdieron mientras estuvo desconectado (reconexión).
        // Sin `desdeId` (primera conexión) no se reenvía nada: el cliente ya cargó el historial por REST.
        const perdidos =
          desdeId === undefined
            ? []
            : await prisma.comentario.findMany({
                where: { ticketId, id: { gt: desdeId }, ...(personal ? {} : { esInterno: false }) },
                include: { autor: { select: { nombre: true, apellidos: true } } },
                orderBy: { id: 'asc' },
              });
        ack?.({
          ok: true, presentes: listaPresentes(ticketId),
          comentarios: perdidos.map((c) => ({
            id: c.id, ticketId, autorId: c.autorId, autorNombre: `${c.autor.nombre} ${c.autor.apellidos}`,
            contenido: c.contenido, esInterno: c.esInterno, creadoAt: c.creadoAt.toISOString(),
          })),
        });
      } catch (e) {
        ack?.(errorAck(e));
      }
    });

    socket.on('ticket:leave', (payload: unknown) => {
      const r = z.object({ ticketId: z.number().int() }).safeParse(payload);
      if (r.success) salirDeSala(socket, r.data.ticketId);
    });

    socket.on('chat:message', async (payload: unknown, ack?: Ack) => {
      try {
        const d = mensajeSchema.parse(payload);
        // El mismo servicio que el endpoint REST: valida permisos, guarda y emite 'comentario.creado'.
        const c = await crearComentario(ctx, u, d.ticketId, d.contenido, d.esInterno);
        ack?.({ ok: true, comentario: c });
      } catch (e) {
        ack?.(errorAck(e));
      }
    });

    socket.on('disconnect', () => {
      ctx.metricas.wsConexiones.dec();
      for (const [ticketId, sala] of presencia) if (sala.has(socket.id)) salirDeSala(socket, ticketId);
    });
  });

  // ---------------------------------------------------------------- Del bus de eventos a las salas
  ctx.bus.on('comentario.creado', ({ comentario }) => {
    const sala = comentario.esInterno ? `ticket:${comentario.ticketId}:staff` : `ticket:${comentario.ticketId}`;
    io.to(sala).emit('chat:message', comentario);
  });
  for (const ev of ['ticket.estado', 'ticket.asignado', 'ticket.actualizado', 'ticket.escalado'] as const) {
    ctx.bus.on(ev, (d) => {
      io.to(`ticket:${d.ticketId}`).emit('ticket:updated', { ticketId: d.ticketId });
    });
  }

  registrarNotificaciones(ctx);
}
