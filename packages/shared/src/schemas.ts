import {z} from 'zod';
import{
  PRIORIDADESINCIDENTE,
  ESTADOSINCIDENTE,
  ROLES,
  TIPOS_ESPACIO,
  TIPOS_EQUIPO,
  ESTADOS_OPERATIVOS
} from './catalogos';

const texto = (min: number, max: number) => z.string().trim().min(min).max(max);

export const passwordSchema = z
.string()
.min(10, 'Minimo 10 caracteres')
.max(100)
.regex(/[a-z]/, 'Debe incluir minusculas')
.regex(/[A-Z]/, 'Debe incluir mayusculas')
.regex(/[0-9]/, 'Debe incluir numeros')

//accesos
export const registroSchema = z.object({
  claveInstitucional: texto(5, 20),
  nombre: texto(1, 80),
  apellidos: texto(1, 120),
  correo: z.string().trim().toLowerCase().email().max(150),
  password: passwordSchema,
  rol: z.enum(['ALUMNO', 'DOCENTE']),
});
export type RegistroInput = z.infer<typeof registroSchema>;

export const loginSchema = z.object({
  //correo de la escuela
  identificador: texto(5, 150),
  password: z.string().min(5).max(100)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const crearUsuarioSchema = registroSchema.omit({rol: true}).extend({roles: z.array(z.enum(ROLES)).min(1),
});

export const editarUsuariosSchema = z.object({
  nombre: texto(1, 80),
  apellidos: texto(1, 120),
  activo: z.boolean(),
  roles: z.array(z.enum(ROLES)).min(1),
  password: passwordSchema,
})
.partial();

export const listarUsuariosSchema = z.object({
  q: z.string().trim().max(150).optional(),
  rol: z.enum(ROLES).optional(),
  activo: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

//catalogos
export const edificioSchema = z.object({
  edificioId: z.number().int().positive(),
  codigo: texto(1, 20),
  nombre: texto(1, 100),
  tipo: z.enum(TIPOS_ESPACIO),
  piso: z.number().int().min(0).max(20).nullable().optional(),
  mapaX:z.number().min(0).max(10000).nullable().optional(),
  mapaY:z.number().min(0).max(10000).nullable().optional(),
  activo: z.boolean().optional(),
});
export const equipoSchema = z.object({
  espacioId: z.number().int().positive(),
  tipo: z.enum(TIPOS_EQUIPO),
  etiquetaInventario: texto(1, 50).nullable().optional(),
  descripcion: texto(1, 200).nullable().optional(),
  estadoOperativo: z.enum(ESTADOS_OPERATIVOS).optional(),
});
export const categoriaSchema = z.object({
  nombre: texto(1, 60),
  descripcion: texto(1, 200).nullable().optional(),
  prioridadSugerida: z.enum(PRIORIDADESINCIDENTE).optional(),
  activo: z.boolean().optional(),
});

//incidentes
export const crearTicketSchema = z.object({
  titulo: texto(5, 150),
  descripcion: texto(10, 1000),
  categoriaId: z.number().int().positive(),
  espacioId: z.number().int().positive(),
  equipoId: z.number().int().positive().nullable().optional(),
  prioridad: z.enum(PRIORIDADESINCIDENTE).optional(),
  evidencia: z.array(z.string()).max(5).optional(),
  //ticket ya existente
  ticketPadreId: z.number().int().positive().nullable().optional(),
});
export type crearTicketInput = z.infer<typeof crearTicketSchema>;

export const listarTicketSchema = z.object({
  q: z.string().trim().max(150).optional(),
  estado: z.enum(ESTADOSINCIDENTE).optional(),
  prioridad: z.enum(PRIORIDADESINCIDENTE).optional(),
  categoriaId: z.number().int().positive().optional(),
  espacioId: z.number().int().positive().optional(),
  asignadoId: z.number().int().positive().optional(),
  sinAsignar: z.enum(['true', 'false']).optional(),
  mios: z.enum(['true', 'false']).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type listarTicketInput = z.infer<typeof listarTicketSchema>;

export const similaresSchema = z.object({
  espacioId: z.coerce.number().int().positive(),
  categoriaId: z.coerce.number().int().positive(),
  equipoId: z.coerce.number().int().positive().optional(),
});

export const cambiarEstadoSchema = z.object({
  estado: z.enum(ESTADOSINCIDENTE),
  //must al abrir otra vez
  motivo: texto(10, 1000).optional(),
});

export const cambiarTicketSchema = z.object({
  prioridad: z.enum(PRIORIDADESINCIDENTE),
  categoriaId: z.number().int().positive()
}).partial().refine(
  (v) => Object.keys(v).length > 0, 'Indicar un campo al menos'
);

export const asignarSchema = z.object({tecnicoId: z.number().int().positive(),});
export const escalarSchema = z.object({motivo: texto(5, 1000),});
export const comentarioSchema = z.object({
  contenido: texto(5, 1000),
  esInterno: z.boolean().optional(),
});
export const reabrirSchema = z.object({motivo: texto(5, 1000),});

//analisis
export const periodoSchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});
export const heatmapSchema = periodoSchema.extend({
  edificioId: z.coerce.number().int().positive().optional(),
  piso: z.coerce.number().int().optional(),
});
