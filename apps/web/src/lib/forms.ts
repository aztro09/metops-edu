import type { ZodError } from 'zod';

/** Convierte los errores de Zod en { campo: mensaje } para mostrarlos junto a cada control. */
export function erroresPorCampo(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? '_');
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
