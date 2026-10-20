export const ROLES = ['ALUMNO', 'DOCENTE', 'TECNICO', 'ADMINISTRADOR'] as const;
export type Rol = (typeof ROLES)[number];

export const ESTADOS = ['ABIERTO', 'EN_PROCESO', 'PENDIENTE', 'RESUELTO', 'CERRADO'] as const;
export type EstadoNombre = (typeof ESTADOS)[number];

export const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const TIPOS_ESPACIO = ['SALON', 'LABORATORIO', 'OTRO'] as const;
export const TIPOS_EQUIPO = ['PROYECTOR', 'COMPUTADORA', 'RED', 'IMPRESORA', 'OTRO'] as const;
export const ESTADOS_OPERATIVOS = ['OPERATIVO', 'CON_FALLA', 'FUERA_SERVICIO'] as const;

/** Tipos de archivo permitidos como evidencia (RF-16). */
export const MIME_EVIDENCIA = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_EVIDENCIAS_POR_TICKET = 5;
