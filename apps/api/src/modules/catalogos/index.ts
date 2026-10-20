import type { FastifyInstance } from 'fastify';
import { categoriaSchema, edificioSchema, equipoSchema, espacioSchema } from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import type { Guardias } from '../../core/auth';
import { sesion } from '../../core/auth';
import { auditar } from '../../core/auditoria';

const idParam = (req: { params: unknown }) => Number((req.params as { id: string }).id);
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

/** RF-29: catálogos de edificios, espacios, equipos y categorías. Lectura: cualquier usuario; escritura: administrador. */
export function moduloCatalogos(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  const { prisma } = ctx;
  const leer = { preHandler: [g.autenticar] };
  const escribir = { preHandler: [g.autenticar, g.permiso('catalogos:gestionar')] };
  const aud = (req: Parameters<typeof sesion>[0], accion: string, entidad: string, id: number) =>
    auditar(ctx, { usuarioId: sesion(req).id, accion, entidad, entidadId: id, ip: req.ip });

  const espacioDto = (e: { mapaX: any; mapaY: any } & Record<string, any>) => ({ ...e, mapaX: num(e.mapaX), mapaY: num(e.mapaY) });

  // ---- Edificios ----
  app.get('/catalogos/edificios', leer, async () => ({
    items: await prisma.edificio.findMany({ orderBy: { codigo: 'asc' } }),
  }));
  app.post('/catalogos/edificios', escribir, async (req, reply) => {
    const e = await prisma.edificio.create({ data: edificioSchema.parse(req.body) });
    await aud(req, 'CATALOGO_CREADO', 'edificio', e.id);
    return reply.status(201).send({ item: e });
  });
  app.patch('/catalogos/edificios/:id', escribir, async (req) => {
    const e = await prisma.edificio.update({ where: { id: idParam(req) }, data: edificioSchema.partial().parse(req.body) });
    await aud(req, 'CATALOGO_EDITADO', 'edificio', e.id);
    return { item: e };
  });

  // ---- Espacios ----
  app.get('/catalogos/espacios', leer, async (req) => {
    const q = req.query as { edificioId?: string; piso?: string; todos?: string };
    const items = await prisma.espacio.findMany({
      where: {
        edificioId: q.edificioId ? Number(q.edificioId) : undefined,
        piso: q.piso !== undefined && q.piso !== '' ? Number(q.piso) : undefined,
        activo: q.todos === 'true' ? undefined : true,
      },
      orderBy: [{ edificioId: 'asc' }, { codigo: 'asc' }],
    });
    return { items: items.map(espacioDto) };
  });
  app.post('/catalogos/espacios', escribir, async (req, reply) => {
    const e = await prisma.espacio.create({ data: espacioSchema.parse(req.body) });
    await aud(req, 'CATALOGO_CREADO', 'espacio', e.id);
    return reply.status(201).send({ item: espacioDto(e) });
  });
  app.patch('/catalogos/espacios/:id', escribir, async (req) => {
    const e = await prisma.espacio.update({ where: { id: idParam(req) }, data: espacioSchema.partial().parse(req.body) });
    await aud(req, 'CATALOGO_EDITADO', 'espacio', e.id);
    return { item: espacioDto(e) };
  });

  // ---- Equipos ----
  app.get('/catalogos/equipos', leer, async (req) => {
    const q = req.query as { espacioId?: string };
    return {
      items: await prisma.equipo.findMany({
        where: { espacioId: q.espacioId ? Number(q.espacioId) : undefined },
        orderBy: { id: 'asc' },
      }),
    };
  });
  app.post('/catalogos/equipos', escribir, async (req, reply) => {
    const e = await prisma.equipo.create({ data: equipoSchema.parse(req.body) });
    await aud(req, 'CATALOGO_CREADO', 'equipo', e.id);
    return reply.status(201).send({ item: e });
  });
  app.patch('/catalogos/equipos/:id', escribir, async (req) => {
    const e = await prisma.equipo.update({ where: { id: idParam(req) }, data: equipoSchema.partial().parse(req.body) });
    await aud(req, 'CATALOGO_EDITADO', 'equipo', e.id);
    return { item: e };
  });

  // ---- Categorías ----
  app.get('/catalogos/categorias', leer, async (req) => {
    const q = req.query as { todas?: string };
    return {
      items: await prisma.categoria.findMany({
        where: q.todas === 'true' ? undefined : { activa: true },
        orderBy: { nombre: 'asc' },
      }),
    };
  });
  app.post('/catalogos/categorias', escribir, async (req, reply) => {
    const c = await prisma.categoria.create({ data: categoriaSchema.parse(req.body) });
    await aud(req, 'CATALOGO_CREADO', 'categoria', c.id);
    return reply.status(201).send({ item: c });
  });
  app.patch('/catalogos/categorias/:id', escribir, async (req) => {
    const c = await prisma.categoria.update({ where: { id: idParam(req) }, data: categoriaSchema.partial().parse(req.body) });
    await aud(req, 'CATALOGO_EDITADO', 'categoria', c.id);
    return { item: c };
  });
}
