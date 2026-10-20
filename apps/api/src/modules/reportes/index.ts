import type { FastifyInstance } from 'fastify';

import { heatmapSchema, listarTicketsSchema, periodoSchema } from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import { sesion, type Guardias } from '../../core/auth';
import { construirWhere } from '../incidentes/filtros';
import { incluirLista } from '../incidentes/dto';

const DIA = 24 * 3600 * 1000;
const periodo = (q: { desde?: Date; hasta?: Date }) => {
  const hasta = q.hasta ?? new Date();
  const desde = q.desde ?? new Date(hasta.getTime() - 30 * DIA);
  return { desde, hasta };
};

/** Celdas CSV: se neutralizan las fórmulas (=, +, -, @) para evitar inyección en Excel/Calc. */
export const celdaCsv = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
};

export function moduloReportes(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  const { prisma, estados } = ctx;
  const ver = { preHandler: [g.autenticar, g.permiso('analitica:ver')] };

  // ---------- KPIs del dashboard (RF-24, RN-03, RN-04) ----------
  app.get('/analytics/kpis', ver, async (req) => {
    const { desde, hasta } = periodo(periodoSchema.parse(req.query));
    const rango = { creadoAt: { gte: desde, lte: hasta } };

    const [porEstado, porPrioridad, sinAsignar, tiempos] = await Promise.all([
      prisma.ticket.groupBy({ by: ['estadoId'], where: rango, _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['prioridad'], where: rango, _count: { _all: true } }),
      prisma.ticket.count({
        where: { asignadoId: null, estadoId: { in: [estados.id('ABIERTO'), estados.id('EN_PROCESO'), estados.id('PENDIENTE')] } },
      }),
      prisma.$queryRaw<{ mtta: number | null; mttr: number | null }[]>`
        SELECT AVG(EXTRACT(EPOCH FROM (acknowledged_at - created_at)) / 3600)::float8 AS mtta,
               AVG(EXTRACT(EPOCH FROM (resolved_at     - created_at)) / 3600)::float8 AS mttr
        FROM tickets WHERE created_at >= ${desde} AND created_at <= ${hasta}`,
    ]);
    const estadoObj: Record<string, number> = {};
    for (const f of porEstado) estadoObj[estados.nombre(f.estadoId)] = f._count._all;
    const prioObj: Record<string, number> = {};
    for (const f of porPrioridad) prioObj[f.prioridad] = f._count._all;
    const total = Object.values(estadoObj).reduce((a, b) => a + b, 0);

    return {
      periodo: { desde, hasta }, total, porEstado: estadoObj, porPrioridad: prioObj, sinAsignar,
      mttaHoras: tiempos[0]?.mtta ?? null, mttrHoras: tiempos[0]?.mttr ?? null,
    };
  });

  // ---------- Por categoría y por espacio (RF-25) ----------
  app.get('/analytics/por-categoria', ver, async (req) => {
    const { desde, hasta } = periodo(periodoSchema.parse(req.query));
    const filas = await prisma.$queryRaw<{ categoria: string; total: number }[]>`
      SELECT c.name AS categoria, COUNT(t.id)::int AS total
      FROM tickets t JOIN categories c ON c.id = t.category_id
      WHERE t.created_at >= ${desde} AND t.created_at <= ${hasta}
      GROUP BY c.name ORDER BY total DESC`;
    return { items: filas };
  });

  app.get('/analytics/por-espacio', ver, async (req) => {
    const { desde, hasta } = periodo(periodoSchema.parse(req.query));
    const filas = await prisma.$queryRaw<{ espacio: string; total: number }[]>`
      SELECT ed.code || ' · ' || e.name AS espacio, COUNT(t.id)::int AS total
      FROM tickets t JOIN spaces e ON e.id = t.space_id JOIN buildings ed ON ed.id = e.building_id
      WHERE t.created_at >= ${desde} AND t.created_at <= ${hasta}
      GROUP BY ed.code, e.name ORDER BY total DESC LIMIT 10`;
    return { items: filas };
  });

  // ---------- Tendencia semanal (RF-25) ----------
  app.get('/analytics/tendencia', ver, async (req) => {
    const { desde, hasta } = periodo(periodoSchema.parse(req.query));
    const filas = await prisma.$queryRaw<{ semana: Date; creados: number; resueltos: number }[]>`
      SELECT date_trunc('week', created_at) AS semana,
             COUNT(*)::int AS creados,
             COUNT(resolved_at)::int AS resueltos
      FROM tickets WHERE created_at >= ${desde} AND created_at <= ${hasta}
      GROUP BY 1 ORDER BY 1`;
    return { items: filas };
  });

  // ---------- Mapa de calor por espacio (RF-26) ----------
  app.get('/analytics/heatmap', ver, async (req) => {
    const q = heatmapSchema.parse(req.query);
    const { desde, hasta } = periodo(q);
    const edificioId = q.edificioId ?? null;
    const piso = q.piso ?? null;
    const filas = await prisma.$queryRaw<
      { id: number; codigo: string; nombre: string; piso: number | null; mapaX: number | null; mapaY: number | null; total: number; categoriaPrincipal: string | null }[]
    >`
      SELECT e.id, e.code AS codigo, e.name AS nombre, e.floor AS piso,
             e.map_x::float8 AS "mapaX", e.map_y::float8 AS "mapaY",
             COUNT(t.id)::int AS total,
             (SELECT c.name FROM tickets t2 JOIN categories c ON c.id = t2.category_id
               WHERE t2.space_id = e.id AND t2.created_at >= ${desde} AND t2.created_at <= ${hasta}
               GROUP BY c.name ORDER BY COUNT(*) DESC, c.name LIMIT 1) AS "categoriaPrincipal"
      FROM spaces e
      LEFT JOIN tickets t ON t.space_id = e.id AND t.created_at >= ${desde} AND t.created_at <= ${hasta}
      WHERE e.active
        AND (${edificioId}::int IS NULL OR e.building_id = ${edificioId}::int)
        AND (${piso}::int IS NULL OR e.floor = ${piso}::int)
      GROUP BY e.id
      ORDER BY e.map_y NULLS LAST, e.map_x NULLS LAST, e.code`;
    return { items: filas };
  });

  // ---------- Recurrencia de fallas (RF-28) ----------
  app.get('/analytics/recurrencia', ver, async (req) => {
    const { desde, hasta } = periodo(periodoSchema.parse(req.query));
    const [espacios, equipos] = await Promise.all([
      prisma.$queryRaw<{ id: number; nombre: string; total: number }[]>`
        SELECT e.id, e.name AS nombre, COUNT(t.id)::int AS total FROM tickets t JOIN spaces e ON e.id = t.space_id
        WHERE t.created_at >= ${desde} AND t.created_at <= ${hasta}
        GROUP BY e.id, e.name ORDER BY total DESC LIMIT 10`,
      prisma.$queryRaw<{ id: number; etiqueta: string | null; tipo: string; total: number }[]>`
        SELECT q.id, q.inventory_tag AS etiqueta, q.type AS tipo, COUNT(t.id)::int AS total
        FROM tickets t JOIN equipment q ON q.id = t.equipment_id
        WHERE t.created_at >= ${desde} AND t.created_at <= ${hasta}
        GROUP BY q.id ORDER BY total DESC LIMIT 10`,
    ]);
    return { espacios, equipos };
  });

  // ---------- Exportar CSV (RF-27) ----------
  app.get('/reportes/tickets.csv', { preHandler: [g.autenticar, g.permiso('reportes:exportar')] }, async (req, reply) => {
    const u = sesion(req);
    const f = listarTicketsSchema.parse(req.query);
    const filas = await prisma.ticket.findMany({
      where: construirWhere(ctx, u, f), include: incluirLista, orderBy: { creadoAt: 'desc' }, take: 5000,
    });
    const cab = ['Folio', 'Título', 'Estado', 'Prioridad', 'Categoría', 'Espacio', 'Reportante', 'Asignado', 'Creado', 'Reconocido', 'Resuelto', 'Cerrado'];
    const lineas = filas.map((t) =>
      [
        t.folio, t.titulo, t.estado.nombre, t.prioridad, t.categoria.nombre,
        `${t.espacio.edificio.codigo}-${t.espacio.codigo}`,
        `${t.reportante.nombre} ${t.reportante.apellidos}`,
        t.asignado ? `${t.asignado.nombre} ${t.asignado.apellidos}` : '',
        t.creadoAt, t.reconocidoAt, t.resueltoAt, t.cerradoAt,
      ].map(celdaCsv).join(','),
    );
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`);
    return '﻿' + [cab.map(celdaCsv).join(','), ...lineas].join('\r\n');
  });

}
