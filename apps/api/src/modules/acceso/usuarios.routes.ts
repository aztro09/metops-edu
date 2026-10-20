import type { FastifyInstance } from 'fastify';
import type { Prisma as PrismaNs } from '@prisma/client';
import { crearUsuarioSchema, editarUsuarioSchema, listarUsuariosSchema } from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import { sesion, type Guardias } from '../../core/auth';
import { conflicto, noEncontrado } from '../../core/errors';
import { auditar } from '../../core/auditoria';
import { hashPassword } from '../../core/seguridad';
import { idsDeRoles, incluirRoles, rolesDe, usuarioPublico } from './usuarios';

export function rutasUsuarios(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  const { prisma } = ctx;
  const admin = { preHandler: [g.autenticar, g.permiso('usuarios:gestionar')] };
  const idParam = (req: { params: unknown }) => Number((req.params as { id: string }).id);

  /** No se puede dejar al sistema sin ningún administrador activo. */
  async function validarUltimoAdmin(usuarioId: number, seguiraSiendoAdminActivo: boolean) {
    if (seguiraSiendoAdminActivo) return;
    const otros = await prisma.usuario.count({
      where: { id: { not: usuarioId }, activo: true, roles: { some: { rol: { nombre: 'ADMINISTRADOR' } } } },
    });
    if (otros === 0) throw conflicto('ULTIMO_ADMIN', 'No puedes quitar o desactivar al último administrador');
  }

  app.get('/users', admin, async (req) => {
    const f = listarUsuariosSchema.parse(req.query);
    const where: PrismaNs.UsuarioWhereInput = {};
    if (f.q) {
      where.OR = [
        { nombre: { contains: f.q, mode: 'insensitive' } },
        { apellidos: { contains: f.q, mode: 'insensitive' } },
        { correo: { contains: f.q, mode: 'insensitive' } },
        { claveInstitucional: { contains: f.q, mode: 'insensitive' } },
      ];
    }
    if (f.rol) where.roles = { some: { rol: { nombre: f.rol } } };
    if (f.activo) where.activo = f.activo === 'true';
    const [total, filas] = await Promise.all([
      prisma.usuario.count({ where }),
      prisma.usuario.findMany({
        where, include: incluirRoles, orderBy: { creadoAt: 'desc' },
        skip: (f.page - 1) * f.pageSize, take: f.pageSize,
      }),
    ]);
    return { total, page: f.page, pageSize: f.pageSize, items: filas.map(usuarioPublico) };
  });

  app.get('/users/:id', admin, async (req) => {
    const u = await prisma.usuario.findUnique({ where: { id: idParam(req) }, include: incluirRoles });
    if (!u) throw noEncontrado('Usuario no encontrado');
    return { usuario: usuarioPublico(u) };
  });

  // Alta de personal (técnicos, otros administradores) por un administrador.
  app.post('/users', admin, async (req, reply) => {
    const d = crearUsuarioSchema.parse(req.body);
    const existe = await prisma.usuario.findFirst({
      where: { OR: [{ correo: d.correo }, { claveInstitucional: d.claveInstitucional }] }, select: { id: true },
    });
    if (existe) throw conflicto('USUARIO_DUPLICADO', 'Ya existe una cuenta con ese correo o clave institucional');
    const u = await prisma.usuario.create({
      data: {
        claveInstitucional: d.claveInstitucional, nombre: d.nombre, apellidos: d.apellidos, correo: d.correo,
        passwordHash: await hashPassword(d.password), activo: true,
        roles: { create: (await idsDeRoles(prisma, d.roles)).map((rolId) => ({ rolId })) },
      },
      include: incluirRoles,
    });
    await auditar(ctx, { usuarioId: sesion(req).id, accion: 'USUARIO_CREADO', entidad: 'usuario', entidadId: u.id, ip: req.ip });
    return reply.status(201).send({ usuario: usuarioPublico(u) });
  });

  app.patch('/users/:id', admin, async (req) => {
    const id = idParam(req);
    const d = editarUsuarioSchema.parse(req.body);
    const actual = await prisma.usuario.findUnique({ where: { id }, include: incluirRoles });
    if (!actual) throw noEncontrado('Usuario no encontrado');

    const rolesFinales = d.roles ?? rolesDe(actual);
    const activoFinal = d.activo ?? actual.activo;
    await validarUltimoAdmin(id, activoFinal && rolesFinales.includes('ADMINISTRADOR'));

    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          nombre: d.nombre, apellidos: d.apellidos, activo: d.activo,
          passwordHash: d.password ? await hashPassword(d.password) : undefined,
        },
      });
      if (d.roles) {
        await tx.usuarioRol.deleteMany({ where: { usuarioId: id } });
        const ids = await idsDeRoles(prisma, d.roles);
        await tx.usuarioRol.createMany({ data: ids.map((rolId) => ({ usuarioId: id, rolId })) });
      }
      // Si se desactiva o se cambia la contraseña, se cierran todas sus sesiones.
      if (d.activo === false || d.password) {
        await tx.refreshToken.updateMany({ where: { usuarioId: id, revocadoAt: null }, data: { revocadoAt: new Date() } });
      }
    });
    await auditar(ctx, {
      usuarioId: sesion(req).id, accion: 'USUARIO_EDITADO', entidad: 'usuario', entidadId: id, ip: req.ip,
      detalle: { activo: d.activo ?? null, roles: d.roles ?? null, passwordCambiada: Boolean(d.password) },
    });
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id }, include: incluirRoles });
    return { usuario: usuarioPublico(u) };
  });
}
