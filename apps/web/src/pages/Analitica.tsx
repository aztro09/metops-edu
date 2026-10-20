import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { consulta, get } from '../lib/api';
import { nivelCalor } from '../lib/format';
import type { CeldaMapa, Edificio, Espacio } from '../lib/tipos';
import { Cargando, ErrorCarga, Tarjeta, Titulo, claseInput } from '../components/ui';

const NIVEL = [
  'bg-white border border-line text-mute',
  'bg-brand/20 text-ink',
  'bg-brand/50 text-ink',
  'bg-brand text-white',
] as const;
const LEYENDA = ['0', '1–3', '4–6', '7 o más'];

export function Analitica() {
  const [edificioId, setEdificioId] = useState('');
  const [piso, setPiso] = useState('');
  const [dias, setDias] = useState(30);
  const [sel, setSel] = useState<CeldaMapa | null>(null);
  const rango = useMemo(() => ({ desde: new Date(Date.now() - dias * 86_400_000).toISOString(), hasta: new Date().toISOString() }), [dias]);

  const edificios = useQuery({ queryKey: ['cat', 'edificios'], queryFn: () => get<{ items: Edificio[] }>('/catalogos/edificios') });
  const edificio = edificioId || String(edificios.data?.items[0]?.id ?? '');
  const espacios = useQuery({
    queryKey: ['cat', 'espacios', edificio], enabled: !!edificio,
    queryFn: () => get<{ items: Espacio[] }>(`/catalogos/espacios${consulta({ edificioId: edificio })}`),
  });
  const pisos = [...new Set((espacios.data?.items ?? []).map((e) => e.piso).filter((p): p is number => p !== null))].sort((a, b) => a - b);

  const mapa = useQuery({
    queryKey: ['heatmap', edificio, piso, dias], enabled: !!edificio,
    queryFn: () => get<{ items: CeldaMapa[] }>(`/analytics/heatmap${consulta({ edificioId: edificio, piso, ...rango })}`),
  });
  const recurrencia = useQuery({
    queryKey: ['recurrencia', dias],
    queryFn: () => get<{ espacios: { id: number; nombre: string; total: number }[] }>(`/analytics/recurrencia${consulta(rango)}`),
  });
  const tendencia = useQuery({
    queryKey: ['tendencia', dias],
    queryFn: () => get<{ items: { semana: string; creados: number; resueltos: number }[] }>(`/analytics/tendencia${consulta(rango)}`),
  });

  // Los espacios se ordenan en una rejilla: una fila por cada valor de mapaY, columnas por mapaX.
  const filas = useMemo(() => {
    const porFila = new Map<number | null, CeldaMapa[]>();
    for (const c of mapa.data?.items ?? []) porFila.set(c.mapaY, [...(porFila.get(c.mapaY) ?? []), c]);
    return [...porFila.entries()].sort((a, b) => (a[0] ?? Infinity) - (b[0] ?? Infinity)).map(([, cs]) => cs.sort((a, b) => (a.mapaX ?? 0) - (b.mapaX ?? 0)));
  }, [mapa.data]);

  return (
    <>
      <Titulo titulo="Mapa de incidentes" subtitulo="Dónde se concentran las fallas." />
      <div className="flex flex-wrap gap-3">
        <select aria-label="Edificio" className={`${claseInput} max-w-44`} value={edificio} onChange={(e) => { setEdificioId(e.target.value); setPiso(''); setSel(null); }}>
          {edificios.data?.items.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
        </select>
        <select aria-label="Piso" className={`${claseInput} max-w-44`} value={piso} onChange={(e) => setPiso(e.target.value)}>
          <option value="">Todos los pisos</option>
          {pisos.map((p) => <option key={p} value={p}>{p === 0 ? 'Planta baja' : `Piso ${p}`}</option>)}
        </select>
        <select aria-label="Periodo" className={`${claseInput} max-w-44`} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option>
        </select>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Tarjeta className="grid content-start gap-4">
          {mapa.isLoading ? <Cargando /> : mapa.isError ? <ErrorCarga error={mapa.error} reintentar={() => mapa.refetch()} /> : (
            <>
              {filas.map((fila, i) => (
                <div key={i} className="flex flex-wrap gap-3">
                  {fila.map((c) => (
                    <button key={c.id} type="button" onClick={() => setSel(c)} aria-pressed={sel?.id === c.id}
                      className={`flex min-h-28 flex-1 basis-32 flex-col justify-between rounded-2xl p-4 text-left text-sm font-medium ${NIVEL[nivelCalor(c.total)]} ${sel?.id === c.id ? 'ring-2 ring-ink' : ''}`}>
                      <span>{c.codigo}</span><b className="text-[28px] font-semibold tracking-tight">{c.total}</b>
                    </button>
                  ))}
                </div>
              ))}
              {filas.length === 0 && <p className="py-8 text-center text-mute">No hay espacios con ubicación en el mapa.</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-2 text-[13px] text-mute">
                {LEYENDA.map((l, i) => <span key={l} className="flex items-center gap-2"><i className={`h-5 w-5 rounded-md ${NIVEL[i]}`} />{l}</span>)}
              </div>
            </>
          )}
        </Tarjeta>

        <div className="grid content-start gap-4">
          <section className="grid gap-3 rounded-[20px] bg-ink p-6 text-white">
            <span className="text-[13px] text-line">Espacio seleccionado</span>
            {sel ? (
              <>
                <span className="text-[28px] font-semibold tracking-tight">{sel.nombre}</span>
                <span className="text-[15px] text-line">{sel.total} incidentes{sel.categoriaPrincipal ? ` · Principal: ${sel.categoriaPrincipal}` : ''}</span>
                <Link to={`/tickets?q=${encodeURIComponent(sel.codigo)}`} className="inline-flex min-h-11 items-center self-start rounded-full bg-brand px-5 text-[15px] font-medium text-white">Ver tickets</Link>
              </>
            ) : <span className="text-[15px] text-line">Elige un espacio del mapa.</span>}
          </section>
          <Tarjeta className="grid gap-1">
            <h2 className="pb-2 text-[19px] font-semibold">Más recurrentes</h2>
            {(recurrencia.data?.espacios ?? []).slice(0, 5).map((e) => (
              <div key={e.id} className="flex justify-between border-t border-line py-3 text-[15px]"><span>{e.nombre}</span><span className="text-mute">{e.total}</span></div>
            ))}
          </Tarjeta>
        </div>
      </div>

      <Tarjeta className="grid gap-3">
        <h2 className="text-[19px] font-semibold">Tendencia semanal</h2>
        <div className="h-64" role="img" aria-label="Gráfica de tickets creados y resueltos por semana">
          <ResponsiveContainer>
            <LineChart data={(tendencia.data?.items ?? []).map((t) => ({ ...t, semana: new Date(t.semana).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) }))}>
              <CartesianGrid stroke="#e8e8ed" vertical={false} />
              <XAxis dataKey="semana" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Tooltip />
              <Line type="monotone" dataKey="creados" name="Creados" stroke="#0071e3" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resueltos" name="Resueltos" stroke="#1d1d1f" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Tarjeta>
    </>
  );
}
