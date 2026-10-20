import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loginSchema, registroSchema } from '@metops/shared';
import type { Ctx } from '../../core/contexto';
import type { Guardias } from '../../core/auth';
import { sesion } from '../../core/auth';
import { AppError, conflicto, noAutenticado, prohibido } from '../../core/errors';
import {
  firmarAcceso, hashPassword, sha256, tokenAleatorio, verificarPassword,
} from '../../core/seguridad';
import { idsDeRoles, incluirRoles, rolesDe, usuarioPublico } from './usuarios';

const COOKIE = 'metops_rt';

export function rutasAuth(app: FastifyInstance, ctx: Ctx, g: Guardias) {
  const { prisma, env } = ctx;
  let hashFalso: Promise<string> | undefined;

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: env.COOKIE_SECURE,
    path: '/api/auth',
    maxAge: env.REFRESH_TTL_DAYS * 24 * 3600,
  };

  async function emitirRefresh(usuarioId: number, familia: string, reply: FastifyReply) {
    const token = tokenAleatorio();
    await prisma.refreshToken.create({
      data: {
        usuarioId, familia, tokenHash: sha256(token),
        expiraAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 24 * 3600 * 1000),
      },
    });
    reply.setCookie(COOKIE, token, cookieOpts);
  }

  // ---------- Registro (RF-01) ----------
  app.post('/auth/register', { config: { rateLimit: { max: env.LOGIN_RATE_MAX, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const d = registroSchema.parse(req.body);
      const existe = await prisma.usuario.findFirst({
        where: { OR: [{ correo: d.correo }, { claveInstitucional: d.claveInstitucional }] },
        select: { id: true },
      });
      if (existe) throw conflicto('USUARIO_DUPLICADO', 'Ya existe una cuenta con ese correo o clave institucional');

      // Alumno: activo de inmediato. Docente: queda pendiente hasta que un administrador lo apruebe (D-01).
      const activo = d.rol === 'ALUMNO';
      const u = await prisma.usuario.create({
        data: {
          claveInstitucional: d.claveInstitucional, nombre: d.nombre, apellidos: d.apellidos,
          correo: d.correo, passwordHash: await hashPassword(d.password), activo,
          roles: { create: (await idsDeRoles(prisma, [d.rol])).map((rolId) => ({ rolId })) },
        },
        include: incluirRoles,
      });
      return reply.status(201).send({ usuario: usuarioPublico(u), requiereAprobacion: !activo });
    });

  // ---------- Login (RF-02) ----------
  app.post('/auth/login', { config: { rateLimit: { max: env.LOGIN_RATE_MAX, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const d = loginSchema.parse(req.body);
      const ident = d.identificador.trim();
      const u = await prisma.usuario.findFirst({
        where: { OR: [{ correo: ident.toLowerCase() }, { claveInstitucional: ident }] },
        include: incluirRoles,
      });
      // Se hace el mismo trabajo aunque el usuario no exista, para no revelarlo por el tiempo de respuesta.
      hashFalso ??= hashPassword('contraseña-falsa-para-igualar-tiempos');
      const ok = await verificarPassword(u?.passwordHash ?? (await hashFalso), d.password);
      if (!u || !ok) throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
      if (!u.activo) throw new AppError(403, 'CUENTA_INACTIVA', 'Tu cuenta está pendiente de aprobación o desactivada');

      await prisma.usuario.update({ where: { id: u.id }, data: { ultimoAcceso: new Date() } });
      await emitirRefresh(u.id, tokenAleatorio().slice(0, 32), reply);
      const accessToken = await firmarAcceso(env.JWT_SECRET, env.ACCESS_TTL_MIN, { id: u.id, roles: rolesDe(u) });
      return { accessToken, usuario: usuarioPublico(u) };
    });

  // ---------- Renovar sesión con rotación y detección de reutilización ----------
  app.post('/auth/refresh', async (req, reply) => {
    const token = (req.cookies as Record<string, string | undefined>)[COOKIE];
    if (!token) throw noAutenticado();
    const fila = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!fila) throw noAutenticado();

    const ahora = new Date();
    if (fila.usadoAt || fila.revocadoAt) {
      // Un token ya usado o revocado se presentó de nuevo: posible robo. Se invalida toda la familia.
      await prisma.refreshToken.updateMany({ where: { familia: fila.familia, revocadoAt: null }, data: { revocadoAt: ahora } });
      reply.clearCookie(COOKIE, { path: cookieOpts.path });
      throw noAutenticado();
    }
    if (fila.expiraAt < ahora) throw noAutenticado();

    // Marca como usado de forma atómica: si dos peticiones llegan a la vez, solo una gana.
    const gano = await prisma.refreshToken.updateMany({
      where: { id: fila.id, usadoAt: null, revocadoAt: null }, data: { usadoAt: ahora },
    });
    if (gano.count !== 1) throw noAutenticado();

    const u = await prisma.usuario.findUnique({ where: { id: fila.usuarioId }, include: incluirRoles });
    if (!u || !u.activo) throw noAutenticado();

    await emitirRefresh(u.id, fila.familia, reply);
    const accessToken = await firmarAcceso(env.JWT_SECRET, env.ACCESS_TTL_MIN, { id: u.id, roles: rolesDe(u) });
    return { accessToken, usuario: usuarioPublico(u) };
  });

  // ---------- Logout (RF-03) ----------
  app.post('/auth/logout', async (req: FastifyRequest, reply) => {
    const token = (req.cookies as Record<string, string | undefined>)[COOKIE];
    if (token) {
      const fila = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
      if (fila) {
        await prisma.refreshToken.updateMany({ where: { familia: fila.familia, revocadoAt: null }, data: { revocadoAt: new Date() } });
      }
    }
    reply.clearCookie(COOKIE, { path: cookieOpts.path });
    return reply.status(204).send();
  });

  // ---------- Perfil ----------
  app.get('/auth/me', { preHandler: [g.autenticar] }, async (req) => {
    const u = await prisma.usuario.findUnique({ where: { id: sesion(req).id }, include: incluirRoles });
    if (!u || !u.activo) throw prohibido('Cuenta no disponible');
    return { usuario: usuarioPublico(u) };
  });
}
