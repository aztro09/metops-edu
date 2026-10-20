import type { Rol, EstadoNombre } from './catalogos';

/** Matriz RBAC del EVS 3 (sección 3.4). Un usuario puede tener varios roles. */
export const PERMISOS = {
  'ticket:crear': ['ALUMNO', 'DOCENTE', 'TECNICO', 'ADMINISTRADOR'],
  'ticket:ver-todos': ['TECNICO', 'ADMINISTRADOR'],
  'ticket:nota-interna': ['TECNICO', 'ADMINISTRADOR'],
  'ticket:tomar': ['TECNICO', 'ADMINISTRADOR'],
  'ticket:asignar': ['ADMINISTRADOR'],
  'ticket:cambiar-estado': ['TECNICO', 'ADMINISTRADOR'],
  'ticket:escalar': ['TECNICO', 'ADMINISTRADOR'],
  'ticket:reabrir': ['ADMINISTRADOR'],
  'ticket:priorizar': ['ADMINISTRADOR'],
  'ticket:resumen': ['TECNICO', 'ADMINISTRADOR'],
  'analitica:ver': ['TECNICO', 'ADMINISTRADOR'],
  'reportes:exportar': ['ADMINISTRADOR'],
  'usuarios:gestionar': ['ADMINISTRADOR'],
  'catalogos:gestionar': ['ADMINISTRADOR'],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;

export const puede = (roles: readonly Rol[], permiso: Permiso): boolean =>
  roles.some((r) => (PERMISOS[permiso] as readonly Rol[]).includes(r));

export const esPersonal = (roles: readonly Rol[]) => puede(roles, 'ticket:ver-todos');

/** Flujo de estados (RF-12). Reabrir y cerrar tienen reglas propias (RN-02, RN-08). */
export const TRANSICIONES: Record<EstadoNombre, readonly EstadoNombre[]> = {
  ABIERTO: ['EN_PROCESO'],
  EN_PROCESO: ['PENDIENTE', 'RESUELTO'],
  PENDIENTE: ['EN_PROCESO', 'RESUELTO'],
  RESUELTO: ['CERRADO'],
  CERRADO: [],
};

export const transicionValida = (de: EstadoNombre, a: EstadoNombre) =>
  TRANSICIONES[de].includes(a);
