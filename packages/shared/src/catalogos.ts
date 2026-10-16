export const ROLES = ['ALUMNO', 'DOCENTE', 'ADMINISTRADOR', 'TECNICO'] as const;
export type Role = (typeof ROLES)[number];

export const ESTADOSINCIDENTE = ['ABIERTO', 'EN_PROCESO','PENDIENTE', 'RESUELTO', 'CERRADO'] as const;
export type EstadoNombre = (typeof ESTADOSINCIDENTE)[number];

export const PRIORIDADESINCIDENTE = ['BAJA', 'MEDIA', 'ALTA','CRITICA'] as const;
export type PrioridadNombre = (typeof PRIORIDADESINCIDENTE)[number];

export const TIPOS_ESPACIO = ['LABORATORIO', 'OFICINA', 'SALON', 'OTRO'] as const;
export const TIPOS_EQUIPO = ['COMPUTADORA', 'IMPRESORA', 'PROYECTOR', 'RED', 'OTRO'] as const;
export const ESTADOS_OPERATIVOS = ['OPERATIVO', 'FUERA_SERVICIO', 'CON_FALLA'] as const;

/*Archivos permitidos*/
export const MIME_EVIDENCIA = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const MAX_EVIDENCIAS_POR_TICKET = 5;
