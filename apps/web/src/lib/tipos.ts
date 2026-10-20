import type { EstadoNombre, Prioridad, Rol } from '@metops/shared';

export interface Usuario {
  id: number;
  claveInstitucional: string;
  nombre: string;
  apellidos: string;
  correo: string;
  activo: boolean;
  roles: Rol[];
  creadoAt?: string;
  ultimoAcceso?: string | null;
}

export interface Persona {
  id: number;
  nombre: string;
  apellidos: string;
  nombreCompleto: string;
}

export interface TicketLista {
  id: number;
  folio: string;
  titulo: string;
  prioridad: Prioridad;
  estado: EstadoNombre;
  categoria: { id: number; nombre: string };
  espacio: { id: number; codigo: string; nombre: string; edificio: { codigo: string } };
  reportante: Persona | null;
  asignado: Persona | null;
  ticketPadreId: number | null;
  creadoAt: string;
  actualizadoAt: string;
}

export interface Comentario {
  id: number;
  ticketId?: number;
  autorId: number;
  autorNombre: string;
  contenido: string;
  esInterno: boolean;
  creadoAt: string;
}

export interface TicketDetalle extends TicketLista {
  descripcion: string;
  equipo: { id: number; tipo: string; etiquetaInventario: string | null; descripcion: string | null } | null;
  reconocidoAt: string | null;
  resueltoAt: string | null;
  cerradoAt: string | null;
  duplicados: number;
  evidencias: { id: number; nombreArchivo: string; tipoMime: string; tamanoBytes: number }[];
  comentarios: Comentario[];
  historial: {
    id: number;
    accion: string;
    usuario: string;
    estadoAnterior: EstadoNombre | null;
    estadoNuevo: EstadoNombre | null;
    detalle: Record<string, unknown> | null;
    creadoAt: string;
  }[];
}

export interface Pagina<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Notificacion {
  id: number;
  ticketId: number | null;
  tipo: string;
  mensaje: string;
  leida: boolean;
  creadoAt: string;
}

export interface Kpis {
  total: number;
  porEstado: Partial<Record<EstadoNombre, number>>;
  porPrioridad: Partial<Record<Prioridad, number>>;
  sinAsignar: number;
  mttaHoras: number | null;
  mttrHoras: number | null;
}

export interface CeldaMapa {
  id: number;
  codigo: string;
  nombre: string;
  piso: number | null;
  mapaX: number | null;
  mapaY: number | null;
  total: number;
  categoriaPrincipal: string | null;
}

export interface Edificio { id: number; codigo: string; nombre: string }
export interface Espacio { id: number; edificioId: number; codigo: string; nombre: string; tipo: string; piso: number | null; mapaX: number | null; mapaY: number | null; activo: boolean }
export interface Equipo { id: number; espacioId: number; tipo: string; etiquetaInventario: string | null; descripcion: string | null; estadoOperativo: string }
export interface Categoria { id: number; nombre: string; descripcion: string | null; prioridadSugerida: Prioridad; activa: boolean }
