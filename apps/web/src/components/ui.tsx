import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { EstadoNombre, Prioridad } from '@metops/shared';
import { ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD } from '../lib/format';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- Botones ----------
type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-brand text-white hover:bg-brand-dark',
  secundario: 'bg-surface text-ink hover:bg-hairline',
  fantasma: 'bg-transparent text-brand hover:bg-surface',
  peligro: 'bg-danger text-white hover:opacity-90',
};
export function Boton({
  variante = 'primario',
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-[15px] font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        className,
      )}
    />
  );
}

// ---------- Formularios ----------
export const claseInput =
  'min-h-11 w-full rounded-xl border border-line bg-white px-4 text-[15px] text-ink placeholder:text-mute focus:border-brand disabled:bg-surface';

/** Etiqueta + control + mensaje de error. El <label> envuelve al control: queda asociado sin ids. */
export function Campo({ etiqueta, error, ayuda, children }: { etiqueta: string; error?: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-ink">{etiqueta}</span>
      {children}
      {ayuda && !error && <span className="text-mute">{ayuda}</span>}
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

// ---------- Contenedores ----------
export function Tarjeta({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-[20px] bg-surface p-6', className)}>{children}</section>;
}

export function Titulo({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1.5">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight sm:text-[40px]">{titulo}</h1>
        {subtitulo && <p className="text-[17px] text-mute">{subtitulo}</p>}
      </div>
      {children}
    </div>
  );
}

// ---------- Etiquetas: la prioridad se distingue por FORMA, no solo por color ----------
const PRIORIDAD_CLASE: Record<Prioridad, string> = {
  CRITICA: 'bg-ink text-white',
  ALTA: 'bg-brand text-white',
  MEDIA: 'border border-brand text-brand',
  BAJA: 'bg-hairline text-mute',
};
export function PrioridadPill({ prioridad }: { prioridad: Prioridad }) {
  return (
    <span className={cx('inline-flex rounded-full px-3 py-0.5 text-xs font-medium', PRIORIDAD_CLASE[prioridad])}>
      {ETIQUETA_PRIORIDAD[prioridad]}
    </span>
  );
}
export function EstadoPill({ estado }: { estado: EstadoNombre }) {
  return (
    <span className="inline-flex rounded-full bg-hairline px-3 py-0.5 text-xs font-medium text-ink">
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

// ---------- Estados de pantalla ----------
export const Cargando = ({ texto = 'Cargando…' }: { texto?: string }) => (
  <p role="status" className="py-10 text-center text-mute">
    {texto}
  </p>
);
export const Vacio = ({ texto }: { texto: string }) => <p className="py-10 text-center text-mute">{texto}</p>;
export function ErrorCarga({ error, reintentar }: { error: unknown; reintentar?: () => void }) {
  return (
    <div role="alert" className="grid justify-items-center gap-3 py-10 text-center">
      <p className="text-danger">{error instanceof Error ? error.message : 'No se pudo cargar'}</p>
      {reintentar && (
        <Boton variante="secundario" onClick={reintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  );
}

// ---------- Avisos (toast) ----------
interface Aviso { id: number; texto: string; tipo: 'ok' | 'error' | 'info' }
const ToastCtx = createContext<(texto: string, tipo?: Aviso['tipo']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const mostrar = useCallback((texto: string, tipo: Aviso['tipo'] = 'info') => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-50 grid max-w-sm gap-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            className={cx(
              'rounded-2xl px-4 py-3 text-sm shadow-lg',
              a.tipo === 'error' ? 'bg-danger text-white' : a.tipo === 'ok' ? 'bg-brand text-white' : 'bg-ink text-white',
            )}
          >
            {a.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
