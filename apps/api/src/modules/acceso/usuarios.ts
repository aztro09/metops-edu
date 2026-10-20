import type { Prisma as PrismaNs } from '@prisma/client';
import type { Rol } from '@metops/shared';
import type { Prisma } from '../../core/db';

export const incluirRoles = { roles: { include: { rol: true } } } satisfies PrismaNs.UsuarioInclude;
type UsuarioConRoles = PrismaNs.UsuarioGetPayload<{ include: typeof incluirRoles }>;

export const rolesDe = (u: UsuarioConRoles): Rol[] => u.roles.map((r) => r.rol.nombre as Rol);

/** Nunca se expone password_hash. */
export function usuarioPublico(u: UsuarioConRoles) {
  return {
    id: u.id,
    claveInstitucional: u.claveInstitucional,
    nombre: u.nombre,
    apellidos: u.apellidos,
    correo: u.correo,
    activo: u.activo,
    roles: rolesDe(u),
    creadoAt: u.creadoAt,
    ultimoAcceso: u.ultimoAcceso,
  };
}

export async function idsDeRoles(prisma: Prisma, nombres: Rol[]) {
  const filas = await prisma.rol.findMany({ where: { nombre: { in: nombres } } });
  return filas.map((f) => f.id);
}
