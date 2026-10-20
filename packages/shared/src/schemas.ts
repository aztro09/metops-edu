import { z } from 'zod';
import {
  PRIORIDADES,
  ESTADOS,
  ROLES,
  TIPOS_ESPACIO,
  TIPOS_EQUIPO,
  ESTADOS_OPERATIVOS,
} from './catalogos';

const texto = (min: number, max: number) => z.string().trim().min(min).max(max);

export const passwordSchema = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(100)
  .regex(/[a-z]/, 'Debe incluir una minúscula')
  .regex(/[A-Z]/, 'Debe incluir una mayúscula')
  .regex(/[0-9]/, 'Debe incluir un número');

// ---------- Acceso ----------
export const registroSchema = z.object({
  claveInstitucional: texto(3, 20),
  nombre: texto(1, 80),
  apellidos: texto(1, 120),
  correo: z.string().trim().toLowerCase().email().max(150),
  password: passwordSchema,
  rol: z.enum(['ALUMNO', 'DOCENTE']),
});
export type RegistroInput = z.infer<typeof registroSchema>;

export const loginSchema = z.object({
  // correo o clave institucional (boleta / no. de empleado)
  identificador: texto(3, 150),
  password: z.string().min(1).max(100),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const crearUsuarioSchema = registroSchema.omit({ rol: true }).extend({
  roles: z.array(z.enum(ROLES)).min(1),
});

export const editarUsuarioSchema = z
  .object({
    nombre: texto(1, 80),
    apellidos: texto(1, 120),
    activo: z.boolean(),
    roles: z.array(z.enum(ROLES)).min(1),
    password: passwordSchema,
  })
  .partial();

export const listarUsuariosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  rol: z.enum(ROLES).optional(),
  activo: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- Catálogos ----------
export const edificioSchema = z.object({ codigo: texto(1, 10), nombre: texto(1, 80) });
export const espacioSchema = z.object({
  edificioId: z.number().int().positive(),
  codigo: texto(1, 20),
  nombre: texto(1, 100),
  tipo: z.enum(TIPOS_ESPACIO),
  piso: z.number().int().min(-5).max(50).nullable().optional(),
  mapaX: z.number().min(0).max(99999).nullable().optional(),
  mapaY: z.number().min(0).max(99999).nullable().optional(),
  activo: z.boolean().optional(),
});
export const equipoSchema = z.object({
  espacioId: z.number().int().positive(),
  tipo: z.enum(TIPOS_EQUIPO),
  etiquetaInventario: texto(1, 40).nullable().optional(),
  descripcion: texto(1, 200).nullable().optional(),
  estadoOperativo: z.enum(ESTADOS_OPERATIVOS).optional(),
});
export const categoriaSchema = z.object({
  nombre: texto(1, 60),
  descripcion: texto(1, 200).nullable().optional(),
  prioridadSugerida: z.enum(PRIORIDADES).optional(),
  activa: z.boolean().optional(),
});

// ---------- Incidentes ----------
export const crearTicketSchema = z.object({
  titulo: texto(5, 150),
  descripcion: texto(10, 4000),
  categoriaId: z.number().int().positive(),
  espacioId: z.number().int().positive(),
  equipoId: z.number().int().positive().nullable().optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  /** Si el usuario eligió "sumarme" a un incidente existente (RF-09, RN-07). */
  ticketPadreId: z.number().int().positive().optional(),
});
export type CrearTicketInput = z.infer<typeof crearTicketSchema>;

export const listarTicketsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(ESTADOS).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  categoriaId: z.coerce.number().int().positive().optional(),
  espacioId: z.coerce.number().int().positive().optional(),
  asignadoId: z.coerce.number().int().positive().optional(),
  sinAsignar: z.enum(['true', 'false']).optional(),
  mios: z.enum(['true', 'false']).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListarTicketsInput = z.infer<typeof listarTicketsSchema>;

export const similaresSchema = z.object({
  espacioId: z.coerce.number().int().positive(),
  categoriaId: z.coerce.number().int().positive().optional(),
  equipoId: z.coerce.number().int().positive().optional(),
});

export const cambiarEstadoSchema = z.object({
  estado: z.enum(ESTADOS),
  /** Obligatorio al reabrir (RN-08). */
  motivo: texto(5, 500).optional(),
});

export const cambiarTicketSchema = z
  .object({ prioridad: z.enum(PRIORIDADES), categoriaId: z.number().int().positive() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');

export const asignarSchema = z.object({ tecnicoId: z.number().int().positive() });
export const escalarSchema = z.object({ motivo: texto(5, 500) });
export const comentarioSchema = z.object({
  contenido: texto(1, 2000),
  esInterno: z.boolean().default(false),
});
export const reabrirSchema = z.object({ motivo: texto(5, 500) });

// ---------- Analítica ----------
export const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});
export const heatmapSchema = periodoSchema.extend({
  edificioId: z.coerce.number().int().positive().optional(),
  piso: z.coerce.number().int().optional(),
});
