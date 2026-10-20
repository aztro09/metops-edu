import type { EstadoNombre, Prioridad } from '@metops/shared';

const zona = 'America/Mexico_City';
export const fechaHora = (iso: string | Date) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: zona }).format(new Date(iso));
export const fecha = (iso: string | Date) =>
  new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: zona }).format(new Date(iso));

export const ETIQUETA_ESTADO: Record<EstadoNombre, string> = {
  ABIERTO: 'Abierto',
  EN_PROCESO: 'En proceso',
  PENDIENTE: 'Pendiente',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
};
export const ETIQUETA_PRIORIDAD: Record<Prioridad, string> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
};

/** 0.5 -> "30 min", 5.4 -> "5.4 h", 30 -> "1.3 d". */
export function duracionHoras(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export const tamanoLegible = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Nivel del mapa de calor (los cuatro rangos del mockup: 0, 1–3, 4–6, 7 o más). */
export const nivelCalor = (n: number): 0 | 1 | 2 | 3 => (n === 0 ? 0 : n <= 3 ? 1 : n <= 6 ? 2 : 3);
