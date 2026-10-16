import type {Role, EstadoNombre} from './catalogos';

/*Matriz RBAC de permisos*/
export const PERMISOS = {
  'ticket:crear': ['ALUMNO', 'DOCENTE', 'ADMINISTRADOR', 'TECNICO'] as Role[],
  'ticket:ver-todos': ['ADMINISTRADOR', 'TECNICO'] as Role[],
  'ticket:ver-propios': ['ALUMNO', 'DOCENTE'] as Role[],
  'ticket:nota-interna': ['ADMINISTRADOR', 'TECNICO'] as Role[],
  'ticket:tomar': ['TECNICO','ADMINISTRADOR'] as Role[],
  'ticket:asignar': ['ADMINISTRADOR'] as Role[],
  'ticket:cambiar-estado': ['TECNICO','ADMINISTRADOR'] as Role[],
  'ticket:escalar': ['TECNICO','ADMINISTRADOR'] as Role[],
  'ticket:reabrir': ['ADMINISTRADOR'] as Role[],
  'ticket:priorizar': ['ADMINISTRADOR'] as Role[],
  'ticket:resumen': ['ADMINISTRADOR', 'TECNICO'] as Role[],
  'analitica:ver': ['ADMINISTRADOR', 'TECNICO'] as Role[],
  'reportes:exportar': ['ADMINISTRADOR'] as Role[],
  'usuarios:gestionar': ['ADMINISTRADOR'] as Role[],
  'catalogos:gestionar': ['ADMINISTRADOR'] as Role[],
} as const satisfies Record<string, Role[]>;

export type Permiso = keyof typeof PERMISOS;
export const puede = (roles: readonly Role[], permiso: Permiso): boolean =>
  roles.some((r) => (PERMISOS[permiso] as readonly Role[]).includes(r));

export const esPersonal = (roles: readonly Role[]) => puede(roles, 'ticket:ver-todos');

/*Flujo estados de tickts*/
export const TRANSICIONES: Record<EstadoNombre, readonly EstadoNombre[]> = {
  ABIERTO: ['EN_PROCESO'],
  EN_PROCESO: ['PENDIENTE', 'RESUELTO'],
  PENDIENTE: ['EN_PROCESO', 'RESUELTO'],
  RESUELTO: ['CERRADO'],
  CERRADO: [],
};

export const transicionValida = (de: EstadoNombre, a:EstadoNombre) => TRANSICIONES[de].includes(a);
