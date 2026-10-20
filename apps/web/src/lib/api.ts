/**
 * Cliente HTTP.
 *  - El token de acceso vive SOLO en memoria (nunca en localStorage).
 *  - Si una petición recibe 401, se renueva la sesión con la cookie httpOnly y se reintenta UNA vez.
 *  - Si varias peticiones fallan a la vez, se hace una sola renovación (single-flight).
 */
import type { Usuario } from './tipos';

let accessToken: string | null = null;
let renovando: Promise<boolean> | null = null;
let sesionEnCurso: Promise<Usuario | null> | null = null;
let alExpirarSesion: () => void = () => {};

export const obtenerToken = () => accessToken;
export const fijarToken = (t: string | null) => {
  accessToken = t;
};
export const alExpirar = (fn: () => void) => {
  alExpirarSesion = fn;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensaje: string,
    public detalle?: unknown,
  ) {
    super(mensaje);
  }
}

async function aError(res: Response): Promise<ApiError> {
  try {
    const j = (await res.json()) as { error?: { codigo?: string; mensaje?: string; detalle?: unknown } };
    return new ApiError(res.status, j.error?.codigo ?? 'ERROR', j.error?.mensaje ?? 'Error inesperado', j.error?.detalle);
  } catch {
    return new ApiError(res.status, 'ERROR', 'Error inesperado');
  }
}

/**
 * Renueva la sesión. Devuelve el usuario si funcionó.
 * Single-flight: el refresh token es de un solo uso, así que dos llamadas simultáneas
 * (p. ej. el doble useEffect de StrictMode) parecerían reutilización y revocarían la sesión.
 */
export function renovarSesion(): Promise<Usuario | null> {
  sesionEnCurso ??= (async () => {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      accessToken = null;
      return null;
    }
    const j = (await res.json()) as { accessToken: string; usuario: Usuario };
    accessToken = j.accessToken;
    return j.usuario;
  })().finally(() => {
    sesionEnCurso = null;
  });
  return sesionEnCurso;
}

async function renovarUnaVez(): Promise<boolean> {
  renovando ??= renovarSesion()
    .then((u) => u !== null)
    .finally(() => {
      renovando = null;
    });
  return renovando;
}

async function pedir(ruta: string, init: RequestInit, reintento: boolean): Promise<Response> {
  const esForm = init.body instanceof FormData;
  const res = await fetch(`/api${ruta}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(esForm || init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && reintento && !ruta.startsWith('/auth/')) {
    if (await renovarUnaVez()) return pedir(ruta, init, false);
    alExpirarSesion();
  }
  return res;
}

export async function api<T = unknown>(ruta: string, init: RequestInit = {}): Promise<T> {
  const res = await pedir(ruta, init, true);
  if (!res.ok) throw await aError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const get = <T>(ruta: string) => api<T>(ruta);
export const post = <T>(ruta: string, cuerpo?: unknown) =>
  api<T>(ruta, { method: 'POST', body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
export const patch = <T>(ruta: string, cuerpo: unknown) =>
  api<T>(ruta, { method: 'PATCH', body: JSON.stringify(cuerpo) });

/** Descarga un archivo protegido (evidencias) como Blob, enviando el token. */
export async function obtenerBlob(ruta: string): Promise<Blob> {
  const res = await pedir(ruta, {}, true);
  if (!res.ok) throw await aError(res);
  return res.blob();
}

/** Construye "?a=1&b=2" omitiendo valores vacíos. */
export function consulta(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
