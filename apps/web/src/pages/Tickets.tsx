import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ESTADOS, PRIORIDADES } from '@metops/shared';
import { useAuth } from '../auth/AuthProvider';
import { consulta, get } from '../lib/api';
import { ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD } from '../lib/format';
import type { Pagina, TicketLista } from '../lib/tipos';
import { TablaTickets } from '../components/TablaTickets';
import { Boton, Cargando, ErrorCarga, Titulo, claseInput } from '../components/ui';

/** Los filtros viven en la URL: se pueden compartir y el botón Atrás funciona. */
export function Tickets() {
  const { puede } = useAuth();
  const [params, setParams] = useSearchParams();
  const p = Object.fromEntries(params);
  const page = Number(p.page ?? 1);
  const [q, setQ] = useState(p.q ?? '');

  const cambiar = (cambios: Record<string, string | undefined>) => {
    const n = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) (v ? n.set(k, v) : n.delete(k));
    if (!('page' in cambios)) n.delete('page');
    setParams(n);
  };

  // Búsqueda con retardo de 300 ms para no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { if ((p.q ?? '') !== q) cambiar({ q: q || undefined }); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tickets', 'lista', params.toString()],
    queryFn: () => get<Pagina<TicketLista>>(`/tickets${consulta({ q: p.q, estado: p.estado, prioridad: p.prioridad, sinAsignar: p.sinAsignar, mios: p.mios, page, pageSize: 15 })}`),
  });
  const paginas = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <Titulo titulo="Tickets" subtitulo="Busca y filtra los incidentes.">
        <Link to="/tickets/nuevo" className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-white hover:bg-brand-dark">
          Nuevo ticket
        </Link>
      </Titulo>
      <div className="flex flex-wrap gap-3">
        <input aria-label="Buscar" placeholder="Folio o título" className={`${claseInput} max-w-xs`} value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Estado" className={`${claseInput} max-w-44`} value={p.estado ?? ''} onChange={(e) => cambiar({ estado: e.target.value || undefined })}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
        </select>
        <select aria-label="Prioridad" className={`${claseInput} max-w-44`} value={p.prioridad ?? ''} onChange={(e) => cambiar({ prioridad: e.target.value || undefined })}>
          <option value="">Toda prioridad</option>
          {PRIORIDADES.map((s) => <option key={s} value={s}>{ETIQUETA_PRIORIDAD[s]}</option>)}
        </select>
        {puede('ticket:ver-todos') && (
          <>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={p.sinAsignar === 'true'} onChange={(e) => cambiar({ sinAsignar: e.target.checked ? 'true' : undefined })} /> Sin asignar
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={p.mios === 'true'} onChange={(e) => cambiar({ mios: e.target.checked ? 'true' : undefined })} /> Reportados por mí
            </label>
          </>
        )}
      </div>
      {isLoading ? <Cargando /> : isError ? <ErrorCarga error={error} reintentar={() => refetch()} /> : (
        <>
          <TablaTickets items={data?.items ?? []} />
          <div className="flex items-center justify-between text-sm text-mute">
            <span>{data?.total ?? 0} resultados</span>
            <div className="flex items-center gap-3">
              <Boton variante="secundario" disabled={page <= 1} onClick={() => cambiar({ page: String(page - 1) })}>Anterior</Boton>
              <span>Página {page} de {paginas}</span>
              <Boton variante="secundario" disabled={page >= paginas} onClick={() => cambiar({ page: String(page + 1) })}>Siguiente</Boton>
            </div>
          </div>
        </>
      )}
    </>
  );
}
