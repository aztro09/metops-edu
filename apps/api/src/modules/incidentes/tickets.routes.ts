import type { FastifyInstance } from 'fastify';
import {
  cambiarEstadoSchema, cambiarTicketSchema, comentarioSchema, crearTicketSchema,
  esPersonal, listarTicketsSchema, reabrirSchema, similaresSchema, type EstadoNombre,
} from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import { sesion, type Guardias } from '../../core/auth';
import { noEncontrado, solicitudInvalida } from '../../core/errors';
import {
  actualizarTicket, cambiarEstado, crearComentario, crearTicket, reabrirTicket,
} from './tickets.servicio';
import { esDuenoOPersonal, incluirLista, ticketLista } from './dto';
import { construirWhere } from './filtros';

const idParam = (req: { params: unknown }) => {
  const id = Number((req.params as { id: string }).id);
  if (!Number.isInteger(id) || id <= 0) throw solicitudInvalida('ID_INVALIDO', 'Identificador inválido');
  return id;
};

export function rutasTickets(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  const { prisma, estados } = ctx;
  const auth = { preHandler: [g.autenticar] };
  const admin = { preHandler: [g.autenticar, g.permiso('ticket:priorizar')] };
  const idsEstados = (nombres: EstadoNombre[]) => nombres.map((n) => estados.id(n));

  // ---------- Crear (RF-07) ----------
  app.post('/tickets', auth, async (req, reply) => {
    const t = await crearTicket(ctx, sesion(req), crearTicketSchema.parse(req.body));
    return reply.status(201).send({ id: t.id, folio: t.folio });
  });

  // ---------- Incidentes similares para evitar duplicados (RF-09, RN-05) ----------
  // Devuelve solo datos del incidente; nunca datos personales de otros usuarios.
  app.get('/tickets/similares', auth, async (req) => {
    const f = similaresSchema.parse(req.query);
    const filas = await prisma.ticket.findMany({
      where: {
        espacioId: f.espacioId, ticketPadreId: null,
        estadoId: { in: idsEstados(['ABIERTO', 'EN_PROCESO', 'PENDIENTE']) },
        ...(f.categoriaId ? { categoriaId: f.categoriaId } : {}),
        ...(f.equipoId ? { equipoId: f.equipoId } : {}),
      },
      include: { estado: true, categoria: { select: { nombre: true } } },
      orderBy: { creadoAt: 'desc' }, take: 5,
    });
    return {
      items: filas.map((t) => ({
        id: t.id, folio: t.folio, titulo: t.titulo, estado: t.estado.nombre,
        categoria: t.categoria.nombre, creadoAt: t.creadoAt,
      })),
    };
  });

  // ---------- Listar con filtros (RF-10) ----------
  app.get('/tickets', auth, async (req) => {
    const u = sesion(req);
    const f = listarTicketsSchema.parse(req.query);
    const where = construirWhere(ctx, u, f);
    const [total, filas] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where, include: incluirLista, orderBy: { creadoAt: 'desc' },
        skip: (f.page - 1) * f.pageSize, take: f.pageSize,
      }),
    ]);
    return { total, page: f.page, pageSize: f.pageSize, items: filas.map(ticketLista) };
  });

  // ---------- Detalle (RF-11) ----------
  app.get('/tickets/:id', auth, async (req) => {
    const u = sesion(req);
    const personal = esPersonal(u.roles);
    const t = await prisma.ticket.findUnique({
      where: { id: idParam(req) },
      include: {
        ...incluirLista,
        equipo: true,
        evidencias: { select: { id: true, nombreArchivo: true, tipoMime: true, tamanoBytes: true, creadoAt: true }, orderBy: { id: 'asc' } },
        comentarios: {
          where: personal ? {} : { esInterno: false },
          include: { autor: { select: { nombre: true, apellidos: true } } },
          orderBy: { id: 'asc' },
        },
        historial: { include: { usuario: { select: { nombre: true, apellidos: true } } }, orderBy: { id: 'asc' } },
        _count: { select: { hijos: true } },
      },
    });
    // 404 (y no 403) para no revelar que el ticket existe.
    if (!t || !esDuenoOPersonal(u.roles, u.id, t.reportanteId)) throw noEncontrado('Ticket no encontrado');

    return {
      ticket: {
        ...ticketLista(t), descripcion: t.descripcion, equipo: t.equipo,
        reconocidoAt: t.reconocidoAt, resueltoAt: t.resueltoAt, cerradoAt: t.cerradoAt,
        duplicados: t._count.hijos,
        evidencias: t.evidencias,
        comentarios: t.comentarios.map((c) => ({
          id: c.id, autorId: c.autorId, autorNombre: `${c.autor.nombre} ${c.autor.apellidos}`,
          contenido: c.contenido, esInterno: c.esInterno, creadoAt: c.creadoAt,
        })),
        historial: t.historial.map((h) => ({
          id: h.id, accion: h.accion, usuario: `${h.usuario.nombre} ${h.usuario.apellidos}`,
          estadoAnterior: h.estadoAnteriorId ? estados.nombre(h.estadoAnteriorId) : null,
          estadoNuevo: h.estadoNuevoId ? estados.nombre(h.estadoNuevoId) : null,
          detalle: personal ? h.detalle : null, creadoAt: h.creadoAt,
        })),
      },
    };
  });

  // ---------- Cambiar estado (RF-12, RF-15) ----------
  app.patch('/tickets/:id/estado', auth, async (req) => {
    const d = cambiarEstadoSchema.parse(req.body);
    await cambiarEstado(ctx, sesion(req), idParam(req), d.estado);
    return { ok: true };
  });

  // ---------- Reabrir con motivo (RN-08) ----------
  app.post('/tickets/:id/reabrir', { preHandler: [g.autenticar, g.permiso('ticket:reabrir')] }, async (req) => {
    await reabrirTicket(ctx, sesion(req), idParam(req), reabrirSchema.parse(req.body).motivo, req.ip);
    return { ok: true };
  });

  // ---------- Priorizar / cambiar categoría (RF-14) ----------
  app.patch('/tickets/:id', admin, async (req) => {
    await actualizarTicket(ctx, sesion(req), idParam(req), cambiarTicketSchema.parse(req.body));
    return { ok: true };
  });

  // ---------- Comentarios (RF-20) ----------
  app.post('/tickets/:id/comentarios', auth, async (req, reply) => {
    const d = comentarioSchema.parse(req.body);
    const c = await crearComentario(ctx, sesion(req), idParam(req), d.contenido, d.esInterno);
    return reply.status(201).send({ comentario: c });
  });

}
