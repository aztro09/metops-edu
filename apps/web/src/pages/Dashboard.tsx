import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { consulta, get } from '../lib/api';
import { duracionHoras } from '../lib/format';
import type { Kpis, Pagina, TicketLista } from '../lib/tipos';
import { TablaTickets } from '../components/TablaTickets';
import { Cargando, ErrorCarga, Tarjeta, Titulo } from '../components/ui';

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string | number }) {
  return (
    <Tarjeta className="grid gap-1">
      <span className="text-sm text-mute">{etiqueta}</span>
      <span className="text-[34px] font-semibold tracking-tight">{valor}</span>
    </Tarjeta>
  );
}

export function Dashboard() {
  const { usuario, puede } = useAuth();
  const staff = puede('analitica:ver');

  const kpis = useQuery({ queryKey: ['kpis'], queryFn: () => get<Kpis>('/analytics/kpis'), enabled: staff });
  const categorias = useQuery({
    queryKey: ['por-categoria'],
    queryFn: () => get<{ items: { categoria: string; total: number }[] }>('/analytics/por-categoria'),
    enabled: staff,
  });
  const atencion = useQuery({
    queryKey: ['tickets', 'sin-asignar'],
    queryFn: () => get<Pagina<TicketLista>>(`/tickets${consulta({ sinAsignar: true, pageSize: 5 })}`),
    enabled: staff,
  });
  const mios = useQuery({
    queryKey: ['tickets', 'mios'],
    queryFn: () => get<Pagina<TicketLista>>(`/tickets${consulta({ mios: true, pageSize: 5 })}`),
  });

  const maximo = Math.max(1, ...(categorias.data?.items.map((c) => c.total) ?? [1]));
  return (
    <>
      <Titulo titulo={`Hola, ${usuario?.nombre}`} subtitulo="Esto es lo que pasa en tu escuela.">
        <Link to="/tickets/nuevo" className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-white hover:bg-brand-dark">
          Nuevo ticket
        </Link>
      </Titulo>

      {staff && (
        <>
          {kpis.isLoading ? <Cargando /> : kpis.isError ? <ErrorCarga error={kpis.error} reintentar={() => kpis.refetch()} /> : kpis.data && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cifra etiqueta="Abiertos" valor={kpis.data.porEstado.ABIERTO ?? 0} />
              <Cifra etiqueta="En proceso" valor={kpis.data.porEstado.EN_PROCESO ?? 0} />
              <Cifra etiqueta="Respuesta promedio (MTTA)" valor={duracionHoras(kpis.data.mttaHoras)} />
              <Cifra etiqueta="Resolución promedio (MTTR)" valor={duracionHoras(kpis.data.mttrHoras)} />
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <Tarjeta className="grid gap-3">
              <h2 className="text-[19px] font-semibold">Requieren atención</h2>
              <p className="text-sm text-mute">Tickets sin técnico asignado.</p>
              <TablaTickets items={atencion.data?.items ?? []} vacio="Todo está asignado" />
            </Tarjeta>
            <Tarjeta className="grid gap-3">
              <h2 className="text-[19px] font-semibold">Por categoría</h2>
              {(categorias.data?.items ?? []).map((c) => (
                <div key={c.categoria} className="grid gap-1 text-sm">
                  <div className="flex justify-between"><span>{c.categoria}</span><b>{c.total}</b></div>
                  <div className="h-2 rounded-full bg-hairline" aria-hidden>
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${(c.total / maximo) * 100}%` }} />
                  </div>
                </div>
              ))}
            </Tarjeta>
          </div>
        </>
      )}

      <Tarjeta className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] font-semibold">Mis tickets</h2>
          <Link to="/tickets?mios=true" className="text-sm text-brand">Ver todos</Link>
        </div>
        {mios.isLoading ? <Cargando /> : <TablaTickets items={mios.data?.items ?? []} vacio="Aún no has reportado incidentes" />}
      </Tarjeta>
    </>
  );
}
